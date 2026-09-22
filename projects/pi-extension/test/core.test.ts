/**
 * Ports of exoskeleton-mcp/test_exoskeleton.py (confine, resolve_query,
 * fuzzy_edit, RepeatDetector) plus parity checks against Python's difflib.
 * Expected numbers were produced by running the Python originals.
 */
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { ratio } from "../lib/difflib.ts";
import { EditError, fuzzyEdit, resolveQuery } from "../lib/matching.ts";
import { confine, JailError, realpathLenient } from "../lib/paths.ts";
import { callKey, RepeatGuard } from "../lib/repeat.ts";
import { cleanup, makeTree, SOURCE } from "./helpers.ts";

describe("difflib parity (values from CPython difflib.SequenceMatcher)", () => {
	const cases: Array<[string, string, number]> = [
		["abcd", "bcde", 0.75],
		["harness contract", "harness-contract.md", 0.8571428571428571],
		["schema.md", "schema.md", 1.0],
		["returncelsius*1.8-32", "returnc*9/5-32", 0.6470588235294118],
		["", "", 1.0],
		["private Thread currentThread;", "private volatile Thread currentThread;", 0.8656716417910447],
		// len(b) >= 200 exercises the autojunk popular-element path
		["a".repeat(250) + "xyz" + "b".repeat(10), "a".repeat(120) + "xyz" + "ab".repeat(60), 0.48616600790513836],
	];
	for (const [a, b, want] of cases) {
		test(`ratio(${JSON.stringify(a.slice(0, 20))}, ${JSON.stringify(b.slice(0, 20))})`, () => {
			assert.ok(Math.abs(ratio(a, b) - want) < 1e-12, `got ${ratio(a, b)} want ${want}`);
		});
	}
});

describe("confine (repo jail)", () => {
	let root: string;
	beforeEach(() => (root = makeTree()));
	afterEach(() => cleanup(root));

	test("relative path inside is resolved", () => {
		assert.equal(confine(root, "00-meta/schema.md"), join(realpathLenient(root), "00-meta", "schema.md"));
	});
	test("absolute path inside is accepted", () => {
		assert.ok(confine(root, join(root, "harness", "generate_notes.py")).startsWith(realpathLenient(root)));
	});
	test("dotdot escape is rejected", () => {
		assert.throws(() => confine(root, "../outside.txt"), JailError);
	});
	test("absolute path outside is rejected", () => {
		assert.throws(() => confine(root, "/etc/passwd"), JailError);
	});
	test("jail error message is calm and names root", () => {
		try {
			confine(root, "/etc/passwd");
			assert.fail("expected JailError");
		} catch (e) {
			assert.ok((e as Error).message.includes(realpathLenient(root)));
			assert.ok(!(e as Error).message.includes("Traceback"));
		}
	});
	test("~ and @ prefixes are expanded like Pi does", () => {
		assert.throws(() => confine(root, "~/.bashrc"), JailError);
		assert.throws(() => confine(root, "@/etc/hosts"), JailError);
		assert.ok(confine(root, "@00-meta/schema.md").endsWith("schema.md"));
	});
	test("symlink pointing outside is rejected, also for a not-yet-existing file under it", () => {
		const outside = join(tmpdir(), `alpharius-out-${process.pid}-${Date.now()}`);
		mkdirSync(outside, { recursive: true });
		try {
			symlinkSync(outside, join(root, "escape"));
			assert.throws(() => confine(root, "escape/new-file.txt"), JailError);
			writeFileSync(join(outside, "x"), "x");
			assert.throws(() => confine(root, "escape/x"), JailError);
		} finally {
			cleanup(outside);
		}
	});
});

describe("resolveQuery (fuzzy path resolver)", () => {
	let root: string;
	beforeEach(() => (root = makeTree()));
	afterEach(() => cleanup(root));

	test("finds file by loose words", () => {
		const r = resolveQuery(root, "harness contract");
		assert.equal(r[0]!.path, "00-meta/harness-contract.md");
	});
	test("exact basename outranks partial", () => {
		assert.equal(resolveQuery(root, "schema.md")[0]!.path, "00-meta/schema.md");
	});
	test(".git dir is never searched", () => {
		assert.ok(!resolveQuery(root, "config").some((r) => r.path === ".git/config"));
	});
	test("no match returns empty list", () => {
		assert.deepEqual(resolveQuery(root, "zzz-nonexistent-qqq"), []);
	});
	test("scores match the Python original exactly", () => {
		assert.deepEqual(resolveQuery(root, "harness contract"), [
			{ path: "00-meta/harness-contract.md", score: 1.857 },
			{ path: "harness/generate_notes.py", score: 0.803 },
		]);
		assert.deepEqual(resolveQuery(root, "harness/contract.md"), [
			{ path: "00-meta/harness-contract.md", score: 1.947 },
			{ path: "harness/generate_notes.py", score: 0.833 },
		]);
		assert.deepEqual(resolveQuery(root, "meta/schma.md"), [
			{ path: "00-meta/schema.md", score: 1.227 },
			{ path: "00-meta/harness-contract.md", score: 0.938 },
		]);
		assert.deepEqual(resolveQuery(root, "schema.md"), [{ path: "00-meta/schema.md", score: 3.0 }]);
	});
});

describe("fuzzyEdit (anchored edit)", () => {
	test("exact anchor is replaced", () => {
		const [out, info] = fuzzyEdit(SOURCE, "return c * 9 / 5 - 32", "return c * 9 / 5 + 32");
		assert.ok(out.includes("return c * 9 / 5 + 32"));
		assert.ok(!out.includes("- 32\n\n\ndef c_to_f"));
		assert.equal(info.match, "exact");
	});
	test("whitespace-sloppy anchor still matches", () => {
		const [out, info] = fuzzyEdit(SOURCE, "return c*9/5 - 32", "    return c * 9 / 5 + 32");
		assert.ok(out.includes("return c * 9 / 5 + 32"));
		assert.equal(info.match, "fuzzy");
	});
	test("no match reports nearest actual text (word-for-word the Python message)", () => {
		assert.throws(
			() => fuzzyEdit(SOURCE, "return celsius * 1.8 - 32", "x"),
			(e: unknown) =>
				e instanceof EditError &&
				e.message ===
					"Anchor not found in the file, even ignoring whitespace. Do not retry the same anchor. " +
						"Nearest actual text in the file:\n    return c * 9 / 5 - 32",
		);
	});
	test("ambiguous anchor is refused with count", () => {
		assert.throws(() => fuzzyEdit("x = 1\ny = 2\nx = 1\n", "x = 1", "x = 3"), /2 places/);
	});
	test("multiline anchor works", () => {
		const [out] = fuzzyEdit(SOURCE, "def f_to_c(f):\n    return (f - 32) * 5 / 9", "def f_to_c(f):\n    return (f - 32) / 1.8");
		assert.ok(out.includes("/ 1.8"));
	});
});

describe("RepeatGuard", () => {
	test("third identical call is flagged", () => {
		const d = new RepeatGuard();
		assert.equal(d.check("read", { path: "x" }), null);
		assert.equal(d.check("read", { path: "x" }), null);
		const msg = d.check("read", { path: "x" });
		assert.ok(msg && msg.includes("3"));
		assert.ok(msg!.toLowerCase().includes("same call three times — change approach or finish"));
	});
	test("different args do not count", () => {
		const d = new RepeatGuard();
		d.check("read", { path: "x" });
		d.check("read", { path: "y" });
		assert.equal(d.check("read", { path: "x" }), null);
	});
	test("key order and bash whitespace/timeout are canonicalised", () => {
		assert.equal(callKey("read", { path: "a", limit: 5 }), callKey("read", { limit: 5, path: "a" }));
		assert.equal(callKey("bash", { command: "ls  -la\n" }), callKey("bash", { command: "ls -la", timeout: 30 }));
		assert.notEqual(callKey("bash", { command: "ls -la" }), callKey("read", { command: "ls -la" }));
	});
	test("interleaved calls inside the window still trip (not only consecutive)", () => {
		const d = new RepeatGuard(3, 10);
		d.check("bash", { command: "pytest" });
		d.check("read", { path: "a" });
		d.check("bash", { command: "pytest" });
		d.check("read", { path: "b" });
		assert.ok(d.check("bash", { command: "pytest" }));
	});
	test("calls that fell out of the window are forgotten", () => {
		const d = new RepeatGuard(3, 4);
		d.check("bash", { command: "pytest" });
		d.check("bash", { command: "pytest" });
		for (const p of ["a", "b", "c"]) d.check("read", { path: p });
		assert.equal(d.check("bash", { command: "pytest" }), null);
	});
	test("reset clears history", () => {
		const d = new RepeatGuard();
		d.check("bash", { command: "pytest" });
		d.check("bash", { command: "pytest" });
		d.reset();
		assert.equal(d.check("bash", { command: "pytest" }), null);
	});
});
