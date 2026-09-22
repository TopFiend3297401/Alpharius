/**
 * Anchored fuzzy edit + fuzzy path resolver — ports of fuzzy_edit(), _iter_files()
 * and resolve_query() from exoskeleton-mcp/exoskeleton.py. Messages are kept
 * word-for-word where the model reads them.
 */
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ratio } from "./difflib.ts";

export const SKIP_DIRS = new Set([".git", ".obsidian", "node_modules", "__pycache__", ".venv"]);

export class EditError extends Error {}

/** Python "".join(s.split()) — drop every whitespace character. */
export function squash(s: string): string {
	return s.replace(/\s+/g, "");
}

function countOccurrences(text: string, needle: string): number {
	if (!needle) return 0;
	let n = 0;
	let i = text.indexOf(needle);
	while (i !== -1) {
		n++;
		i = text.indexOf(needle, i + needle.length);
	}
	return n;
}

/** Line windows of the anchor's height whose whitespace-squashed text equals the anchor's. */
export function whitespaceHits(text: string, anchor: string): Array<{ index: number; segment: string }> {
	const lines = text.split("\n");
	const window = anchor.split("\n").length;
	const target = squash(anchor);
	const hits: Array<{ index: number; segment: string }> = [];
	for (let i = 0; i < lines.length - window + 1; i++) {
		const segment = lines.slice(i, i + window).join("\n");
		if (squash(segment) === target) hits.push({ index: i, segment });
	}
	return hits;
}

/** The line window most similar to the anchor (SequenceMatcher ratio on squashed text). */
export function nearestText(text: string, anchor: string): { segment: string; score: number } | null {
	const lines = text.split("\n");
	const window = anchor.split("\n").length;
	const target = squash(anchor);
	let best: string | null = null;
	let bestScore = 0.0;
	for (let i = 0; i < lines.length - window + 1; i++) {
		const segment = lines.slice(i, i + window).join("\n");
		const score = ratio(squash(segment), target);
		if (score > bestScore) {
			best = segment;
			bestScore = score;
		}
	}
	return best === null ? null : { segment: best, score: bestScore };
}

export interface EditInfo {
	match: "exact" | "fuzzy";
	occurrences: 1;
}

/**
 * Replace one occurrence of anchor in text. Tier 1 exact substring, tier 2
 * whitespace-insensitive line windows; zero matches throws EditError carrying the
 * nearest actual text, several matches throws EditError with the count.
 */
export function fuzzyEdit(text: string, anchor: string, replacement: string): [string, EditInfo] {
	const count = countOccurrences(text, anchor);
	if (count === 1) {
		const i = text.indexOf(anchor);
		return [text.slice(0, i) + replacement + text.slice(i + anchor.length), { match: "exact", occurrences: 1 }];
	}
	if (count > 1) {
		throw new EditError(
			`Anchor matches ${count} places in the file; it must match exactly ` +
				`one. Include a neighbouring line to make it unique.`,
		);
	}
	const lines = text.split("\n");
	const window = anchor.split("\n").length;
	const hits = whitespaceHits(text, anchor);
	if (hits.length === 1) {
		const { index } = hits[0]!;
		const newLines = [...lines.slice(0, index), ...replacement.split("\n"), ...lines.slice(index + window)];
		return [newLines.join("\n"), { match: "fuzzy", occurrences: 1 }];
	}
	if (hits.length > 1) {
		throw new EditError(
			`Anchor matches ${hits.length} places in the file (ignoring ` +
				`whitespace); it must match exactly one. Include a neighbouring ` +
				`line to make it unique.`,
		);
	}
	const best = nearestText(text, anchor);
	const nearest = best ? ` Nearest actual text in the file:\n${best.segment}` : "";
	throw new EditError(
		`Anchor not found in the file, even ignoring whitespace. Do not ` + `retry the same anchor.${nearest}`,
	);
}

/** Repo files, skipping SKIP_DIRS and dot-entries. Yields absolute paths. Capped for huge trees. */
export function* iterFiles(root: string, cap = 50_000): Generator<string> {
	const stack = [root];
	let n = 0;
	while (stack.length) {
		const d = stack.pop()!;
		let entries;
		try {
			entries = readdirSync(d, { withFileTypes: true });
		} catch {
			continue;
		}
		entries.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
		for (const e of entries) {
			if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
			const p = join(d, e.name);
			if (e.isDirectory()) stack.push(p);
			else if (e.isFile()) {
				yield p;
				if (++n >= cap) return;
			}
		}
	}
}

export interface PathCandidate {
	path: string;
	score: number;
}

/** Fuzzy file finder. Returns [{path, score}] best-first, repo-relative posix paths. */
export function resolveQuery(root: string, query: string, limit = 5): PathCandidate[] {
	const q = query.toLowerCase();
	const tokens = q.replace(/\//g, " ").split(/\s+/).filter(Boolean);
	if (!tokens.length) return [];
	const results: PathCandidate[] = [];
	for (const f of iterFiles(root)) {
		const rel = relative(root, f).split(sep).join("/");
		const name = (f.split(sep).pop() ?? "").toLowerCase();
		const relLower = rel.toLowerCase();
		const baseRatio = ratio(q, name);
		const tokenHits = tokens.filter((t) => relLower.includes(t)).length;
		let score = baseRatio + tokenHits / tokens.length;
		if (name === q) score += 1.0;
		if (score >= 0.75) results.push({ path: rel, score: Math.round(score * 1000) / 1000 });
	}
	results.sort((x, y) => y.score - x.score || (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
	return results.slice(0, limit);
}
