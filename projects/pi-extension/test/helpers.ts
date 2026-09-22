import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Same tree as exoskeleton-mcp/test_exoskeleton.py make_tree(). */
export function makeTree(): string {
	const root = mkdtempSync(join(tmpdir(), "alpharius-"));
	mkdirSync(join(root, "00-meta"), { recursive: true });
	writeFileSync(join(root, "00-meta", "harness-contract.md"), "# Contract\nfields here\n");
	writeFileSync(join(root, "00-meta", "schema.md"), "# Schema\n");
	mkdirSync(join(root, "harness"));
	writeFileSync(join(root, "harness", "generate_notes.py"), "def main():\n    pass\n");
	mkdirSync(join(root, ".git"));
	writeFileSync(join(root, ".git", "config"), "[core]\n");
	return root;
}

export function cleanup(root: string) {
	rmSync(root, { recursive: true, force: true });
}

export const SOURCE =
	"def c_to_f(c):\n" + "    return c * 9 / 5 - 32\n" + "\n" + "\n" + "def f_to_c(f):\n" + "    return (f - 32) * 5 / 9\n";
