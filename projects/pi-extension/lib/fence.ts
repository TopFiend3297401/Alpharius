/**
 * Shell fence. Two layers:
 *  1. DENY patterns, verbatim from the harness-trials fence.ts (ssh/scp/rsync,
 *     `find /`, `find /home`).
 *  2. Path escape: every path-shaped word in the command is resolved against
 *     the cwd (symlinks included) and refused if it lands outside the repo.
 *
 * Layer 2 is a heuristic over a small shell tokenizer, not a shell parser. It
 * sees literal paths — `cat /etc/passwd`, `cd ..`, `ls ~/x`, `> ../out`,
 * `--dir=/srv` — and not paths built at runtime (`$(echo /etc)`, a path inside a
 * `python -c` string). Heredoc bodies and `#` comments are skipped so file
 * contents written via `cat <<EOF` are not mistaken for path arguments.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expandUserPath, isInside, realpathLenient } from "./paths.ts";

export const DENY: Array<[RegExp, string]> = [
	[/(^|[\s;&|(`$])(ssh|scp|rsync)(\s|$)/, "ssh, scp and rsync are denied in this project"],
	[/(^|[\s;&|(`$])find\s+\/(\s|$)/, "find / is denied — stay inside the repository"],
	[/(^|[\s;&|(`$])find\s+\/home/, "find /home is denied — stay inside the repository"],
];

export const DEFAULT_ALLOW = [
	"/dev/null",
	"/dev/stdin",
	"/dev/stdout",
	"/dev/stderr",
	"/dev/tty",
	"/dev/zero",
	"/dev/random",
	"/dev/urandom",
];

/** Remove heredoc bodies (`<<EOF ... EOF`, `<<-'EOF'`, `<<"EOF"`). */
export function stripHeredocs(command: string): string {
	const lines = command.split("\n");
	const out: string[] = [];
	const pending: Array<{ delim: string; dash: boolean }> = [];
	for (const line of lines) {
		if (pending.length) {
			const { delim, dash } = pending[0]!;
			const test = dash ? line.replace(/^\t+/, "") : line;
			if (test === delim || test.trim() === delim) pending.shift();
			continue;
		}
		out.push(line);
		const re = /<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(line))) pending.push({ delim: m[3]!, dash: m[1] === "-" });
	}
	return out.join("\n");
}

export interface Token {
	word: string;
	/** true when this word is in command position (first word of a simple command). */
	commandWord: boolean;
}

const OPERATOR_CHARS = new Set([";", "&", "|", "(", ")", "<", ">", "`", "\n"]);

/** Split into words, honouring quotes and backslashes, dropping comments. */
export function tokenize(command: string): Token[] {
	const src = stripHeredocs(command);
	const tokens: Token[] = [];
	let word = "";
	let inWord = false;
	let expectCommand = true;
	let lastOp = "";
	const flush = () => {
		if (!inWord) return;
		const isAssign = /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
		// Redirect targets (after < or >) are never command words.
		const cmd = expectCommand && !isAssign && lastOp !== "<" && lastOp !== ">";
		tokens.push({ word, commandWord: cmd });
		if (cmd) expectCommand = false;
		word = "";
		inWord = false;
		lastOp = "";
	};
	for (let i = 0; i < src.length; i++) {
		const c = src[i]!;
		if (c === "\\" && i + 1 < src.length) {
			word += src[++i];
			inWord = true;
			continue;
		}
		if (c === "'" || c === '"') {
			const end = src.indexOf(c, i + 1);
			const stop = end === -1 ? src.length : end;
			word += src.slice(i + 1, stop);
			inWord = true;
			i = stop;
			continue;
		}
		if (c === "#" && !inWord) {
			const nl = src.indexOf("\n", i);
			i = nl === -1 ? src.length : nl - 1;
			continue;
		}
		if (c === " " || c === "\t") {
			flush();
			continue;
		}
		if (OPERATOR_CHARS.has(c)) {
			flush();
			if (c === "<" || c === ">") lastOp = c;
			else {
				// &> and >& are redirects; a lone & or | or ; starts a new command.
				const prev = src[i - 1];
				if (c === "&" && (prev === ">" || src[i + 1] === ">")) lastOp = ">";
				else if (c !== ")") expectCommand = true; // `$(pwd)/..` continues an argument
			}
			continue;
		}
		word += c;
		inWord = true;
	}
	flush();
	return tokens;
}

function pathCandidate(word: string): string | null {
	if (word.includes("://")) return null;
	let w = word;
	if (w.startsWith("-")) {
		const eq = w.indexOf("=");
		if (eq === -1) return null;
		w = w.slice(eq + 1);
	} else {
		const assign = /^[A-Za-z_][A-Za-z0-9_]*=(.*)$/s.exec(w);
		if (assign) w = assign[1]!;
	}
	if (
		w.startsWith("/") ||
		w.startsWith("~") ||
		w.startsWith("$HOME") ||
		w.startsWith("${HOME}") ||
		w === ".." ||
		w.startsWith("../") ||
		w.includes("/../") ||
		w.endsWith("/..")
	) {
		return w;
	}
	return null;
}

export interface FenceVerdict {
	block: true;
	reason: string;
}

/** Returns a block verdict, or null when the command stays inside the repo. */
export function checkBash(command: string, root: string, cwd: string, allow: string[] = DEFAULT_ALLOW): FenceVerdict | null {
	for (const [re, reason] of DENY) if (re.test(command)) return { block: true, reason };
	const realRoot = realpathLenient(root);
	const allowed = allow.map((a) => realpathLenient(a));
	// `cd sub && cat ../x` is legal, so a literal `cd` moves the base that later
	// words resolve against. Subshell scoping is ignored: `(cd sub); cat ../x`
	// resolves ../x from sub — a known gap, one directory deep at most.
	let dir = cwd;
	const escapes = (part: string): FenceVerdict | null => {
		const resolved = realpathLenient(expandUserPath(part, dir));
		if (isInside(realRoot, resolved) || allowed.some((a) => isInside(a, resolved))) return null;
		return {
			block: true,
			reason:
				`'${part}' resolves to ${resolved}, outside the repository ${realRoot}. ` +
				`Stay inside the repository: use paths relative to it.`,
		};
	};
	let prevCommand = "";
	for (const tok of tokenize(command)) {
		if (tok.commandWord) {
			prevCommand = tok.word; // running /usr/bin/env is not leaving the repo
			continue;
		}
		const isCdArg = prevCommand === "cd";
		prevCommand = "";
		const cand = pathCandidate(tok.word);
		if (!cand) {
			// A plain relative word that exists could still be a symlink out of the repo.
			if (!tok.word.startsWith("-") && !tok.word.includes("://")) {
				const abs = resolve(dir, tok.word);
				if (existsSync(abs)) {
					const v = escapes(tok.word);
					if (v) return v;
				}
			}
			if (isCdArg) dir = resolve(dir, tok.word);
			continue;
		}
		// A colon-separated list (PATH=/a:/b) is checked part by part.
		for (const part of cand.includes(":") && !cand.startsWith("~") ? cand.split(":") : [cand]) {
			if (!part || !pathCandidate(part)) continue;
			const v = escapes(part);
			if (v) return v;
		}
		if (isCdArg) dir = expandUserPath(cand, dir);
	}
	return null;
}
