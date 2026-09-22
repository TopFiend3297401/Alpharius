/**
 * The hook functions driven with fake events, and — where Pi is installed —
 * against Pi's REAL read/edit tool implementations, reproducing the agent
 * loop's order: tool_call -> execute (throw => error result) -> tool_result.
 * No model is started.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { type AlphariusConfig, configFromEnv, createAlpharius } from "../lib/alpharius.ts";
import { cleanup, makeTree, SOURCE } from "./helpers.ts";

const PI = process.env.PI_PKG ?? join(homedir(), ".local/lib/node_modules/@earendil-works/pi-coding-agent");
const HAVE_PI = existsSync(join(PI, "dist/core/tools/edit.js"));

function cfg(root: string, over: Partial<AlphariusConfig> = {}): AlphariusConfig {
	return { ...configFromEnv({}), root, ...over };
}

let n = 0;
const ev = (toolName: string, input: Record<string, unknown>) => ({ toolName, toolCallId: `c${++n}`, input });
const text = (content: Array<{ type: string; text?: string }>) => content.map((c) => c.text ?? "").join("\n");

describe("configFromEnv", () => {
	test("everything on by default", () => {
		const c = configFromEnv({});
		assert.deepEqual([c.fence, c.jail, c.repeat, c.editRescue, c.pathHint], [true, true, true, true, true]);
		assert.equal(c.repeatThreshold, 3);
		assert.equal(c.repeatWindow, 10);
	});
	test("each feature switches off on its own; ALPHARIUS=0 switches all off", () => {
		const c = configFromEnv({ ALPHARIUS_REPEAT: "0", ALPHARIUS_PATH_HINT: "off", ALPHARIUS_ROOT: "/x" });
		assert.deepEqual([c.fence, c.jail, c.repeat, c.editRescue, c.pathHint], [true, true, false, true, false]);
		assert.equal(c.root, "/x");
		const d = configFromEnv({ ALPHARIUS: "false" });
		assert.deepEqual([d.fence, d.jail, d.repeat, d.editRescue, d.pathHint], [false, false, false, false, false]);
	});
	test("extra allow paths append to the /dev defaults", () => {
		const c = configFromEnv({ ALPHARIUS_ALLOW_PATHS: "/tmp:/opt/x" });
		assert.ok(c.allowPaths.includes("/dev/null") && c.allowPaths.includes("/tmp") && c.allowPaths.includes("/opt/x"));
	});
});

describe("tool_call hook", () => {
	let root: string;
	beforeEach(() => (root = makeTree()));
	afterEach(() => cleanup(root));

	test("fence blocks bash escapes with a reason", () => {
		const a = createAlpharius(cfg(root));
		const r = a.onToolCall(ev("bash", { command: "find /home -name mind-vault" }), { cwd: root });
		assert.equal(r?.block, true);
		assert.match(r!.reason, /find \/home is denied/);
		assert.equal(a.onToolCall(ev("bash", { command: "ls harness" }), { cwd: root }), undefined);
	});
	test("jail blocks read/write/edit outside the root", () => {
		const a = createAlpharius(cfg(root));
		for (const [tool, input] of [
			["read", { path: "/etc/passwd" }],
			["write", { path: "../x.txt", content: "x" }],
			["edit", { path: "~/.bashrc", edits: [{ oldText: "a", newText: "b" }] }],
		] as const) {
			const r = a.onToolCall(ev(tool, input as never), { cwd: root });
			assert.equal(r?.block, true, tool);
			assert.match(r!.reason, /outside the project root/);
		}
		assert.equal(a.onToolCall(ev("read", { path: "00-meta/schema.md" }), { cwd: root }), undefined);
	});
	test("repeat guard catches a bash loop on the 3rd identical call", () => {
		const a = createAlpharius(cfg(root));
		const call = () => a.onToolCall(ev("bash", { command: "python3 harness/generate_notes.py" }), { cwd: root });
		assert.equal(call(), undefined);
		assert.equal(call(), undefined);
		const r = call();
		assert.equal(r?.block, true);
		assert.match(r!.reason, /same call three times — change approach or finish/i);
	});
	test("a successful edit/write resets the repeat history (re-running tests after a fix is progress)", () => {
		const a = createAlpharius(cfg(root));
		const call = () => a.onToolCall(ev("bash", { command: "pytest" }), { cwd: root });
		call();
		call();
		a.onToolResult({ ...ev("edit", { path: "x" }), content: [{ type: "text", text: "ok" }], isError: false }, { cwd: root });
		assert.equal(call(), undefined);
	});
	test("features switched off do nothing", () => {
		const a = createAlpharius(cfg(root, { fence: false, jail: false, repeat: false }));
		assert.equal(a.onToolCall(ev("bash", { command: "cat /etc/passwd" }), { cwd: root }), undefined);
		assert.equal(a.onToolCall(ev("read", { path: "/etc/passwd" }), { cwd: root }), undefined);
		for (let i = 0; i < 5; i++) assert.equal(a.onToolCall(ev("bash", { command: "ls" }), { cwd: root }), undefined);
	});
	test("root is frozen: a changed ctx.cwd does not move the jail", () => {
		const a = createAlpharius(cfg(root));
		a.onToolCall(ev("read", { path: "00-meta/schema.md" }), { cwd: root });
		const r = a.onToolCall(ev("read", { path: join(root, "..", "elsewhere.txt") }), { cwd: join(root, "..") });
		assert.equal(r?.block, true);
	});
});

describe("tool_result hook (fake results)", () => {
	let root: string;
	beforeEach(() => {
		root = makeTree();
		writeFileSync(join(root, "conv.py"), SOURCE);
	});
	afterEach(() => cleanup(root));

	test("edit 'Could not find' gets the nearest actual text appended", () => {
		const a = createAlpharius(cfg(root));
		const r = a.onToolResult(
			{
				...ev("edit", { path: "conv.py", edits: [{ oldText: "return celsius * 1.8 - 32", newText: "x" }] }),
				content: [{ type: "text", text: "Could not find the exact text in conv.py. The old text must match exactly including all whitespace and newlines." }],
				isError: true,
			},
			{ cwd: root },
		);
		assert.ok(r);
		assert.match(text(r!.content as never), /Nearest actual text in the file:\n    return c \* 9 \/ 5 - 32/);
	});
	test("read of a phantom path gets up to 3 candidates", () => {
		const a = createAlpharius(cfg(root));
		const r = a.onToolResult(
			{
				...ev("read", { path: "harness/contract.md" }),
				content: [{ type: "text", text: `ENOENT: no such file or directory, access '${root}/harness/contract.md'` }],
				isError: true,
			},
			{ cwd: root },
		);
		const t = text(r!.content as never);
		assert.match(t, /Closest files in the project:\n  00-meta\/harness-contract\.md/);
		assert.ok(t.split("\n").filter((l) => l.startsWith("  ")).length <= 3);
	});
	test("phantom path with nothing similar says so instead of inviting a search", () => {
		const a = createAlpharius(cfg(root));
		const r = a.onToolResult(
			{ ...ev("read", { path: "zzz-qqq.xyz" }), content: [{ type: "text", text: "ENOENT: no such file" }], isError: true },
			{ cwd: root },
		);
		assert.match(text(r!.content as never), /do not search outside the project/);
	});
	test("successful results are left untouched (zero added tokens on the happy path)", () => {
		const a = createAlpharius(cfg(root));
		const r = a.onToolResult({ ...ev("read", { path: "conv.py" }), content: [{ type: "text", text: SOURCE }], isError: false }, { cwd: root });
		assert.equal(r, undefined);
	});
});

describe("against Pi's real read/edit tools", { skip: HAVE_PI ? false : `Pi not found at ${PI}` }, () => {
	let root: string;
	let editDef: any;
	let readDef: any;
	beforeEach(async () => {
		root = makeTree();
		writeFileSync(join(root, "conv.py"), SOURCE);
		editDef = (await import(join(PI, "dist/core/tools/edit.js"))).createEditToolDefinition(root);
		readDef = (await import(join(PI, "dist/core/tools/read.js"))).createReadToolDefinition(root);
	});
	afterEach(() => cleanup(root));

	/** Mirrors pi-agent-core's prepare -> beforeToolCall -> execute -> afterToolCall. */
	async function run(a: ReturnType<typeof createAlpharius>, def: any, input: Record<string, unknown>) {
		const e = ev(def.name, input);
		const ctx = { cwd: root };
		const blocked = a.onToolCall(e, ctx);
		if (blocked) return { isError: true, text: blocked.reason };
		let content: any[];
		let isError = false;
		try {
			content = (await def.execute(e.toolCallId, e.input, undefined, () => {}, ctx)).content;
		} catch (err) {
			content = [{ type: "text", text: (err as Error).message }];
			isError = true;
		}
		const patch = a.onToolResult({ ...e, content, isError }, ctx);
		return { isError, text: text((patch?.content ?? content) as never) };
	}

	test("stale edit: Pi's error plus the nearest real text", async () => {
		const a = createAlpharius(cfg(root));
		const r = await run(a, editDef, { path: "conv.py", edits: [{ oldText: "return celsius * 1.8 - 32", newText: "x" }] });
		assert.equal(r.isError, true);
		assert.match(r.text, /Could not find the exact text/);
		assert.match(r.text, /Nearest actual text in the file:\n    return c \* 9 \/ 5 - 32/);
	});
	test("stale edit in a multi-edit call names the failing edits[i]", async () => {
		const a = createAlpharius(cfg(root));
		const r = await run(a, editDef, {
			path: "conv.py",
			edits: [
				{ oldText: "def c_to_f(c):", newText: "def c2f(c):" },
				{ oldText: "return (fahrenheit - 32) / 1.8", newText: "x" },
			],
		});
		assert.equal(r.isError, true);
		assert.match(r.text, /edits\[1\]: Anchor not found.*\n    return \(f - 32\) \* 5 \/ 9/s);
	});
	test("whitespace-sloppy anchor that Pi alone rejects is rescued and applied", async () => {
		// Without the extension, Pi fails this (its fuzzy match only trims trailing whitespace).
		await assert.rejects(
			editDef.execute("x", { path: "conv.py", edits: [{ oldText: "return c*9/5 - 32", newText: "    return c * 9 / 5 + 32" }] }, undefined, () => {}, { cwd: root }),
			/Could not find/,
		);
		const a = createAlpharius(cfg(root));
		const r = await run(a, editDef, { path: "conv.py", edits: [{ oldText: "return c*9/5 - 32", newText: "    return c * 9 / 5 + 32" }] });
		assert.equal(r.isError, false, r.text);
		assert.match(r.text, /matched ignoring whitespace/);
		assert.ok(readFileSync(join(root, "conv.py"), "utf-8").includes("    return c * 9 / 5 + 32\n"));
	});
	test("an anchor Pi already finds is not touched", async () => {
		const a = createAlpharius(cfg(root));
		const r = await run(a, editDef, { path: "conv.py", edits: [{ oldText: "return c * 9 / 5 - 32", newText: "return c * 9 / 5 + 32" }] });
		assert.equal(r.isError, false);
		assert.doesNotMatch(r.text, /matched ignoring whitespace/);
	});
	test("phantom read path: Pi's ENOENT plus candidates", async () => {
		const a = createAlpharius(cfg(root));
		const r = await run(a, readDef, { path: "harness/contract.md" });
		assert.equal(r.isError, true);
		assert.match(r.text, /ENOENT/);
		assert.match(r.text, /00-meta\/harness-contract\.md/);
	});
	test("jailed read never reaches Pi's tool", async () => {
		const a = createAlpharius(cfg(root));
		const r = await run(a, readDef, { path: "/etc/hostname" });
		assert.equal(r.isError, true);
		assert.match(r.text, /outside the project root/);
	});
});
