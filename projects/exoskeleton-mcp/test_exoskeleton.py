"""Tests for the exoskeleton MCP server. Run: python3 test_exoskeleton.py"""

import shutil
import tempfile
import unittest
from pathlib import Path

import exoskeleton as exo


def make_tree(root: Path):
    (root / "00-meta").mkdir(parents=True)
    (root / "00-meta" / "harness-contract.md").write_text("# Contract\nfields here\n")
    (root / "00-meta" / "schema.md").write_text("# Schema\n")
    (root / "harness").mkdir()
    (root / "harness" / "generate_notes.py").write_text("def main():\n    pass\n")
    (root / ".git").mkdir()
    (root / ".git" / "config").write_text("[core]\n")


class TestConfine(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        make_tree(self.root)

    def tearDown(self):
        shutil.rmtree(self.root)

    def test_relative_path_inside_is_resolved(self):
        p = exo.confine(self.root, "00-meta/schema.md")
        self.assertEqual(p, (self.root / "00-meta" / "schema.md").resolve())

    def test_absolute_path_inside_is_accepted(self):
        p = exo.confine(self.root, str(self.root / "harness" / "generate_notes.py"))
        self.assertTrue(str(p).startswith(str(self.root.resolve())))

    def test_dotdot_escape_is_rejected(self):
        with self.assertRaises(exo.JailError):
            exo.confine(self.root, "../outside.txt")

    def test_absolute_path_outside_is_rejected(self):
        with self.assertRaises(exo.JailError):
            exo.confine(self.root, "/etc/passwd")

    def test_jail_error_message_is_calm_and_names_root(self):
        try:
            exo.confine(self.root, "/etc/passwd")
        except exo.JailError as e:
            self.assertIn(str(self.root.resolve()), str(e))
            self.assertNotIn("Traceback", str(e))


class TestResolveQuery(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        make_tree(self.root)

    def tearDown(self):
        shutil.rmtree(self.root)

    def test_finds_file_by_loose_words(self):
        results = exo.resolve_query(self.root, "harness contract")
        self.assertTrue(results)
        self.assertEqual(results[0]["path"], "00-meta/harness-contract.md")

    def test_exact_basename_outranks_partial(self):
        results = exo.resolve_query(self.root, "schema.md")
        self.assertEqual(results[0]["path"], "00-meta/schema.md")

    def test_git_dir_is_never_searched(self):
        results = exo.resolve_query(self.root, "config")
        self.assertNotIn(".git/config", [r["path"] for r in results])

    def test_no_match_returns_empty_list(self):
        results = exo.resolve_query(self.root, "zzz-nonexistent-qqq")
        self.assertEqual(results, [])


SOURCE = (
    "def c_to_f(c):\n"
    "    return c * 9 / 5 - 32\n"
    "\n"
    "\n"
    "def f_to_c(f):\n"
    "    return (f - 32) * 5 / 9\n"
)


class TestFuzzyEdit(unittest.TestCase):
    def test_exact_anchor_is_replaced(self):
        new, info = exo.fuzzy_edit(SOURCE, "return c * 9 / 5 - 32", "return c * 9 / 5 + 32")
        self.assertIn("return c * 9 / 5 + 32", new)
        self.assertNotIn("- 32\n\n\ndef c_to_f", new)
        self.assertEqual(info["match"], "exact")

    def test_whitespace_sloppy_anchor_still_matches(self):
        # model remembered the line without indentation and with collapsed spaces
        new, info = exo.fuzzy_edit(SOURCE, "return c*9/5 - 32", "    return c * 9 / 5 + 32")
        self.assertIn("return c * 9 / 5 + 32", new)
        self.assertEqual(info["match"], "fuzzy")

    def test_no_match_reports_nearest_actual_text(self):
        with self.assertRaises(exo.EditError) as ctx:
            exo.fuzzy_edit(SOURCE, "return celsius * 1.8 - 32", "x")
        msg = str(ctx.exception)
        self.assertIn("return c * 9 / 5 - 32", msg)  # the nearest real line
        self.assertIn("not found", msg.lower())

    def test_ambiguous_anchor_is_refused_with_count(self):
        text = "x = 1\ny = 2\nx = 1\n"
        with self.assertRaises(exo.EditError) as ctx:
            exo.fuzzy_edit(text, "x = 1", "x = 3")
        self.assertIn("2", str(ctx.exception))

    def test_multiline_anchor_works(self):
        anchor = "def f_to_c(f):\n    return (f - 32) * 5 / 9"
        new, info = exo.fuzzy_edit(SOURCE, anchor, "def f_to_c(f):\n    return (f - 32) / 1.8")
        self.assertIn("/ 1.8", new)


class TestRepeatDetector(unittest.TestCase):
    def test_third_identical_call_is_flagged(self):
        d = exo.RepeatDetector()
        self.assertIsNone(d.check("find_file", {"query": "x"}))
        self.assertIsNone(d.check("find_file", {"query": "x"}))
        msg = d.check("find_file", {"query": "x"})
        self.assertIsNotNone(msg)
        self.assertIn("3", msg)

    def test_different_args_do_not_count(self):
        d = exo.RepeatDetector()
        d.check("find_file", {"query": "x"})
        d.check("find_file", {"query": "y"})
        self.assertIsNone(d.check("find_file", {"query": "x"}))


class TestServer(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        make_tree(self.root)
        self.server = exo.Server(self.root)

    def tearDown(self):
        shutil.rmtree(self.root)

    def call(self, method, params=None, id_=1):
        req = {"jsonrpc": "2.0", "id": id_, "method": method}
        if params is not None:
            req["params"] = params
        return self.server.handle(req)

    def tool(self, name, arguments, id_=2):
        resp = self.call("tools/call", {"name": name, "arguments": arguments}, id_)
        result = resp["result"]
        return result["content"][0]["text"], result.get("isError", False)

    def test_initialize_echoes_protocol_version(self):
        resp = self.call("initialize", {"protocolVersion": "2025-06-18",
                                        "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}})
        self.assertEqual(resp["result"]["protocolVersion"], "2025-06-18")
        self.assertIn("tools", resp["result"]["capabilities"])
        self.assertEqual(resp["result"]["serverInfo"]["name"], "exoskeleton")

    def test_initialized_notification_gets_no_response(self):
        resp = self.server.handle({"jsonrpc": "2.0", "method": "notifications/initialized"})
        self.assertIsNone(resp)

    def test_tools_list_has_three_tools_with_schemas(self):
        resp = self.call("tools/list")
        tools = resp["result"]["tools"]
        names = sorted(t["name"] for t in tools)
        self.assertEqual(names, ["edit_file", "find_file", "read_file"])
        for t in tools:
            self.assertEqual(t["inputSchema"]["type"], "object")
            self.assertTrue(t["description"])

    def test_unknown_method_is_jsonrpc_error(self):
        resp = self.call("resources/list")
        self.assertEqual(resp["error"]["code"], -32601)

    def test_unknown_tool_is_jsonrpc_error(self):
        resp = self.call("tools/call", {"name": "nope", "arguments": {}})
        self.assertEqual(resp["error"]["code"], -32602)

    def test_find_file_returns_match_and_state_echo(self):
        text, is_err = self.tool("find_file", {"query": "harness contract"})
        self.assertFalse(is_err)
        self.assertIn("00-meta/harness-contract.md", text)
        self.assertIn("Project root:", text)

    def test_read_file_returns_content(self):
        text, is_err = self.tool("read_file", {"path": "00-meta/schema.md"})
        self.assertFalse(is_err)
        self.assertIn("# Schema", text)

    def test_read_outside_root_is_tool_error_not_crash(self):
        text, is_err = self.tool("read_file", {"path": "/etc/passwd"})
        self.assertTrue(is_err)
        self.assertIn("outside the project root", text)

    def test_edit_file_applies_fuzzy_edit_to_disk(self):
        text, is_err = self.tool("edit_file", {
            "path": "harness/generate_notes.py",
            "anchor": "def main():\n  pass",
            "replacement": "def main():\n    return 0",
        })
        self.assertFalse(is_err)
        on_disk = (self.root / "harness" / "generate_notes.py").read_text()
        self.assertIn("return 0", on_disk)

    def test_edit_failure_reports_nearest_text_as_tool_error(self):
        text, is_err = self.tool("edit_file", {
            "path": "harness/generate_notes.py",
            "anchor": "def wrong():",
            "replacement": "x",
        })
        self.assertTrue(is_err)
        self.assertIn("Nearest actual text", text)

    def test_third_identical_tool_call_gets_corrective_message(self):
        args = {"query": "schema"}
        self.tool("find_file", args, id_=10)
        self.tool("find_file", args, id_=11)
        text, is_err = self.tool("find_file", args, id_=12)
        self.assertTrue(is_err)
        self.assertIn("identical", text.lower())


class TestStdioIntegration(unittest.TestCase):
    def test_initialize_and_list_over_stdio(self):
        import json
        import subprocess
        import sys

        root = Path(tempfile.mkdtemp())
        make_tree(root)
        try:
            server_path = Path(__file__).parent / "exoskeleton.py"
            requests = [
                {"jsonrpc": "2.0", "id": 1, "method": "initialize",
                 "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                            "clientInfo": {"name": "t", "version": "0"}}},
                {"jsonrpc": "2.0", "method": "notifications/initialized"},
                {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            ]
            stdin = "".join(json.dumps(r) + "\n" for r in requests)
            proc = subprocess.run([sys.executable, str(server_path)], input=stdin,
                                  capture_output=True, text=True, timeout=10,
                                  cwd=str(root))
            lines = [json.loads(l) for l in proc.stdout.splitlines() if l.strip()]
            self.assertEqual(len(lines), 2)  # notification gets no reply
            self.assertEqual(lines[0]["id"], 1)
            self.assertIn("serverInfo", lines[0]["result"])
            self.assertEqual(lines[1]["id"], 2)
            names = [t["name"] for t in lines[1]["result"]["tools"]]
            self.assertIn("edit_file", names)
            self.assertEqual(proc.returncode, 0)
        finally:
            shutil.rmtree(root)


if __name__ == "__main__":
    unittest.main(verbosity=2)
