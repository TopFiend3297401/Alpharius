import assert from "node:assert/strict";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { checkBash, tokenize } from "../lib/fence.ts";
import { cleanup, makeTree } from "./helpers.ts";

describe("bash fence", () => {
	let root: string;
	beforeEach(() => (root = makeTree()));
	afterEach(() => cleanup(root));
	const blocked = (cmd: string, cwd = root) => checkBash(cmd, root, cwd) !== null;

	test("ssh/scp/rsync denied (harness-trials fence.ts patterns)", () => {
		for (const c of ["ssh jdean@vortex.local", "ls && scp a b:", "rsync -a . x:/y", "echo $(ssh h)"]) assert.ok(blocked(c), c);
		assert.ok(!blocked("echo sshd-config"));
	});
	test("find / and find /home denied", () => {
		assert.match(checkBash("find / -name x", root, root)!.reason, /find \/ is denied/);
		assert.match(checkBash("find /home/someone -name vault", root, root)!.reason, /find \/home is denied/);
	});
	test("paths escaping the repo are blocked", () => {
		for (const c of [
			"cat /etc/passwd",
			"cd .. && ls",
			"ls ../",
			"ls ~/Documents",
			'cat "$HOME/.ssh/id_ed25519"',
			"echo hi > ../out.txt",
			"grep -r foo harness/../../",
			"tar czf x.tgz --directory=/srv .",
			"FOO=/etc/x python3 run.py",
			"ls; cat /srv/secret",
			"cd harness && cat ../../etc/hosts",
			"cat $(pwd)/../x",
		])
			assert.ok(blocked(c), c);
	});
	test("in-repo work is allowed", () => {
		for (const c of [
			"ls -la",
			"cat 00-meta/schema.md",
			"python3 harness/generate_notes.py 2>&1 | head",
			"grep -rn 'def main' harness",
			"npm test > /dev/null 2>&1",
			"/usr/bin/env python3 -c 'print(1)'",
			"cd harness && cat ../00-meta/schema.md",
			"curl -s https://example.com/a/b",
			"git log --oneline -5 # see /etc for nothing",
		])
			assert.equal(checkBash(c, root, root), null, c);
	});
	test("heredoc bodies are not treated as path arguments", () => {
		const cmd = "cat > app.js <<'EOF'\nfetch('/api/users');\nconst p = '/etc/nothing';\nEOF\nnode app.js";
		assert.equal(checkBash(cmd, root, root), null);
		// ...but the command line of the heredoc still is
		assert.ok(blocked("cat > /tmp/app.js <<EOF\nx\nEOF"));
	});
	test("a symlink inside the repo pointing out is caught", () => {
		const outside = join(root, "..", `alpharius-sym-${process.pid}`);
		mkdirSync(outside, { recursive: true });
		try {
			symlinkSync(outside, join(root, "link"));
			assert.ok(blocked("cat link/../../etc/passwd"));
			assert.ok(blocked("ls link/"), "symlinked dir resolves outside");
		} finally {
			cleanup(outside);
		}
	});
	test("tokenizer marks command words and redirect targets", () => {
		const t = tokenize("A=1 /usr/bin/env ls /x > /y; /bin/cat z");
		assert.deepEqual(
			t.map((x) => [x.word, x.commandWord]),
			[
				["A=1", false],
				["/usr/bin/env", true],
				["ls", false],
				["/x", false],
				["/y", false],
				["/bin/cat", true],
				["z", false],
			],
		);
	});
});
