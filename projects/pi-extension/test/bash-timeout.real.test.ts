/**
 * The bash default timeout against Pi's REAL bash tool: the hook fills `timeout`, then Pi's own
 * implementation must actually kill a command that would hang. A test that only checks the
 * argument was set would pass even if Pi ignored it (a dead knob). Skipped when Pi is absent.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { configFromEnv, createAlpharius } from "../lib/alpharius.ts";

const PI = process.env.PI_PKG ?? join(homedir(), ".local/lib/node_modules/@earendil-works/pi-coding-agent");
const BASH = join(PI, "dist/core/tools/bash.js");

test("Pi's real bash tool kills a hanging command at the injected default", { skip: !existsSync(BASH) }, async () => {
	const { createBashTool } = await import(BASH);
	const cwd = tmpdir();
	const tool = createBashTool(cwd);
	const a = createAlpharius({ ...configFromEnv({}), root: cwd, bashTimeout: 2 });
	const input: Record<string, unknown> = { command: "sleep 30; echo finished" };
	assert.equal(a.onToolCall({ toolName: "bash", toolCallId: "t1", input }), undefined);
	assert.equal(input.timeout, 2);
	const t0 = Date.now();
	let out = "";
	try {
		const r = await tool.execute("t1", input, new AbortController().signal, () => {});
		out = JSON.stringify(r);
	} catch (e) {
		out = String(e);
	}
	const secs = (Date.now() - t0) / 1000;
	assert.ok(secs < 10, `took ${secs}s — the timeout did not fire`);
	assert.doesNotMatch(out, /finished/);
});
