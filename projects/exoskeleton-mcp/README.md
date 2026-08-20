# exoskeleton-mcp

An MCP server that compensates for the tool-mechanics failures of very small coding models.
Single file, Python 3, **zero dependencies** — the MCP stdio protocol is newline-delimited
JSON-RPC, implemented directly.

Status: v0.1.0, working. 28 tests, including a live stdio protocol round-trip:
`python3 test_exoskeleton.py`.

## Tools

- `find_file` — fuzzy file finder: loose words in, ranked repo-relative paths out. Replaces
  guessing paths and filesystem-wide `find`.
- `read_file` — read inside the project; paths outside the root are refused with a calm
  correction, not an error dump.
- `edit_file` — anchored fuzzy edit: exact match first, whitespace-insensitive second, must be
  unique either way. A missed anchor returns the *nearest actual text* from the file so the next
  attempt starts from reality, not memory.

Server-side behaviours on every call: a structural repo jail (escape is impossible, not
discouraged), repeat detection (the third identical call gets a corrective message instead of
the same result), and a state echo footer (project root, file count) to re-ground a model that
loses the plot across turns.

Design rationale, mapped to the failure taxonomy: `../../vault/dev/exoskeleton-mcp-design.md`
and `../../vault/docs/failure-taxonomy.md`.

## Wiring into OpenCode

Add to your project's `opencode.json`:

```json
{
  "mcp": {
    "exoskeleton": {
      "type": "local",
      "command": ["python3", "/path/to/Alpharius/projects/exoskeleton-mcp/exoskeleton.py"],
      "enabled": true
    }
  }
}
```

The project root defaults to the server process's working directory; set the
`EXOSKELETON_ROOT` environment variable in the config's `environment` map to pin it explicitly.

## Limitations

- Speaks the legacy (initialize-handshake) MCP era, which today's clients all support;
  modern per-request `_meta` (spec revision 2026-07-28) is a planned addition.
- Narrated-but-never-emitted tool calls have no tool-side fix — that failure mode belongs to
  prompting (see the `brief-small-models` skill).
- The exoskeleton tools sit beside the harness's builtin tools; whether small models reliably
  prefer them is an open measurement question, not an assumption.
