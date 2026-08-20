#!/usr/bin/env python3
"""Exoskeleton MCP server: tool-mechanics compensation for small coding models.

Zero dependencies. See ../../vault/dev/exoskeleton-mcp-design.md for the design.
"""

import json
import os
import sys
from difflib import SequenceMatcher
from pathlib import Path

SKIP_DIRS = {".git", ".obsidian", "node_modules", "__pycache__", ".venv"}


class JailError(Exception):
    """A path resolved outside the project root."""


class EditError(Exception):
    """An edit anchor that could not be applied safely."""


def _squash(s):
    return "".join(s.split())


def fuzzy_edit(text, anchor, replacement):
    """Replace one occurrence of anchor in text.

    Tier 1: exact substring. Tier 2: whitespace-insensitive match over line
    windows, so an anchor remembered with wrong indentation or spacing still
    lands. Either tier must match exactly once; zero matches raises EditError
    carrying the nearest actual text so the caller's next attempt starts from
    reality, and multiple matches raise EditError with the count.
    Returns (new_text, info) where info["match"] is "exact" or "fuzzy".
    """
    count = text.count(anchor)
    if count == 1:
        return text.replace(anchor, replacement, 1), {"match": "exact", "occurrences": 1}
    if count > 1:
        raise EditError(
            f"Anchor matches {count} places in the file; it must match exactly "
            f"one. Include a neighbouring line to make it unique."
        )

    lines = text.split("\n")
    anchor_lines = anchor.split("\n")
    window = len(anchor_lines)
    target = _squash(anchor)
    hits = []
    for i in range(len(lines) - window + 1):
        segment = "\n".join(lines[i : i + window])
        if _squash(segment) == target:
            hits.append((i, segment))
    if len(hits) == 1:
        i, segment = hits[0]
        new_lines = lines[:i] + replacement.split("\n") + lines[i + window :]
        return "\n".join(new_lines), {"match": "fuzzy", "occurrences": 1}
    if len(hits) > 1:
        raise EditError(
            f"Anchor matches {len(hits)} places in the file (ignoring "
            f"whitespace); it must match exactly one. Include a neighbouring "
            f"line to make it unique."
        )

    best, best_score = None, 0.0
    for i in range(len(lines) - window + 1):
        segment = "\n".join(lines[i : i + window])
        score = SequenceMatcher(None, _squash(segment), target).ratio()
        if score > best_score:
            best, best_score = segment, score
    nearest = f" Nearest actual text in the file:\n{best}" if best else ""
    raise EditError(
        f"Anchor not found in the file, even ignoring whitespace. Do not "
        f"retry the same anchor.{nearest}"
    )


def confine(root, user_path):
    """Resolve user_path and require it to stay inside root. Returns the resolved Path."""
    root = Path(root).resolve()
    p = Path(user_path)
    candidate = (p if p.is_absolute() else root / p).resolve()
    if candidate != root and root not in candidate.parents:
        raise JailError(
            f"Path '{user_path}' is outside the project root {root}. "
            f"All paths must stay inside the project. Use find_file to locate "
            f"the file you meant."
        )
    return candidate


def _iter_files(root):
    root = Path(root).resolve()
    stack = [root]
    while stack:
        d = stack.pop()
        for entry in sorted(d.iterdir()):
            if entry.name in SKIP_DIRS or entry.name.startswith("."):
                continue
            if entry.is_dir():
                stack.append(entry)
            elif entry.is_file():
                yield entry


def resolve_query(root, query, limit=5):
    """Fuzzy file finder. Returns [{path, score}] ranked best-first, repo-relative paths."""
    root = Path(root).resolve()
    tokens = [t for t in query.lower().replace("/", " ").split() if t]
    if not tokens:
        return []
    results = []
    for f in _iter_files(root):
        rel = f.relative_to(root).as_posix()
        name = f.name.lower()
        rel_lower = rel.lower()
        base_ratio = SequenceMatcher(None, query.lower(), name).ratio()
        token_hits = sum(1 for t in tokens if t in rel_lower)
        score = base_ratio + token_hits / len(tokens)
        if name == query.lower():
            score += 1.0
        if score >= 0.75:
            results.append({"path": rel, "score": round(score, 3)})
    results.sort(key=lambda r: (-r["score"], r["path"]))
    return results[:limit]


class RepeatDetector:
    """Flags the third identical (tool, arguments) call so the loop breaks."""

    def __init__(self, threshold=3):
        self.threshold = threshold
        self.counts = {}

    def check(self, name, arguments):
        key = (name, json.dumps(arguments, sort_keys=True))
        self.counts[key] = self.counts.get(key, 0) + 1
        n = self.counts[key]
        if n >= self.threshold:
            return (
                f"This is identical call number {n} — the same tool with the "
                f"same arguments. Repeating it will give the same result. "
                f"Stop, re-read the previous result, and change something: "
                f"the arguments, the tool, or the plan."
            )
        return None


READ_CAP = 50_000

TOOLS = [
    {
        "name": "find_file",
        "description": (
            "Fuzzy file finder for this project. Give a loose name or a few "
            "words (e.g. 'harness contract') and get the real repo-relative "
            "paths, ranked. Use this instead of guessing a path or searching "
            "the filesystem."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "File name or words from it"}},
            "required": ["query"],
        },
    },
    {
        "name": "read_file",
        "description": (
            "Read a file inside the project. Accepts a repo-relative or "
            "absolute path; paths outside the project are refused. Read a "
            "file before editing it."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Path to the file"}},
            "required": ["path"],
        },
    },
    {
        "name": "edit_file",
        "description": (
            "Replace one occurrence of anchor text in a file with new text. "
            "The anchor is matched exactly first, then ignoring whitespace, "
            "so small formatting differences are tolerated — but it must "
            "match exactly one place. If it is not found you get the nearest "
            "actual text from the file: use that, do not retry the same anchor."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the file"},
                "anchor": {"type": "string", "description": "Existing text to replace, exactly one occurrence"},
                "replacement": {"type": "string", "description": "New text"},
            },
            "required": ["path", "anchor", "replacement"],
        },
    },
]


class Server:
    """Legacy-era (initialize-handshake) MCP server over newline-delimited JSON-RPC."""

    def __init__(self, root):
        self.root = Path(root).resolve()
        self.repeats = RepeatDetector()

    def _echo(self):
        n = sum(1 for _ in _iter_files(self.root))
        return f"\n—\nProject root: {self.root} ({n} files). Paths above are repo-relative."

    def _tool_find_file(self, args):
        results = resolve_query(self.root, args["query"])
        if not results:
            body = (
                f"No file in the project matches '{args['query']}'. The file "
                f"may not exist; do not search outside the project."
            )
        else:
            body = "\n".join(f"{r['path']}  (score {r['score']})" for r in results)
        return body + self._echo()

    def _tool_read_file(self, args):
        p = confine(self.root, args["path"])
        if not p.is_file():
            raise EditError(
                f"'{args['path']}' does not exist. Use find_file to locate the "
                f"file you meant."
            )
        text = p.read_text(errors="replace")
        if len(text) > READ_CAP:
            text = text[:READ_CAP] + f"\n[truncated at {READ_CAP} characters]"
        return text + self._echo()

    def _tool_edit_file(self, args):
        p = confine(self.root, args["path"])
        if not p.is_file():
            raise EditError(
                f"'{args['path']}' does not exist, so it cannot be edited. Use "
                f"find_file to locate the file you meant."
            )
        text = p.read_text(errors="replace")
        new_text, info = fuzzy_edit(text, args["anchor"], args["replacement"])
        p.write_text(new_text)
        return (
            f"Edited {p.relative_to(self.root).as_posix()} "
            f"({info['match']} anchor match, 1 replacement)." + self._echo()
        )

    def _call_tool(self, req_id, params):
        name = params.get("name")
        handlers = {
            "find_file": self._tool_find_file,
            "read_file": self._tool_read_file,
            "edit_file": self._tool_edit_file,
        }
        if name not in handlers:
            return _error(req_id, -32602, f"Unknown tool: {name}")
        arguments = params.get("arguments") or {}
        repeat_msg = self.repeats.check(name, arguments)
        if repeat_msg:
            return _tool_result(req_id, repeat_msg, is_error=True)
        try:
            return _tool_result(req_id, handlers[name](arguments), is_error=False)
        except (JailError, EditError) as e:
            return _tool_result(req_id, str(e), is_error=True)
        except Exception as e:  # keep the loop alive; the model can read this
            return _tool_result(req_id, f"Tool failed: {type(e).__name__}: {e}", is_error=True)

    def handle(self, request):
        method = request.get("method")
        req_id = request.get("id")
        if req_id is None:  # notification
            return None
        if method == "initialize":
            params = request.get("params") or {}
            return _result(req_id, {
                "protocolVersion": params.get("protocolVersion", "2025-06-18"),
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "exoskeleton", "version": "0.1.0"},
            })
        if method == "ping":
            return _result(req_id, {})
        if method == "tools/list":
            return _result(req_id, {"tools": TOOLS})
        if method == "tools/call":
            return self._call_tool(req_id, request.get("params") or {})
        return _error(req_id, -32601, f"Method not found: {method}")


def _result(req_id, result):
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _error(req_id, code, message):
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def _tool_result(req_id, text, is_error):
    return _result(req_id, {"content": [{"type": "text", "text": text}], "isError": is_error})


def main():
    root = os.environ.get("EXOSKELETON_ROOT", os.getcwd())
    server = Server(root)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue
        response = server.handle(request)
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
