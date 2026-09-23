/**
 * The hook logic, independent of Pi's runtime so it can be tested with fake
 * events. index.ts only wires these two functions to pi.on(...).
 *
 * Nothing here registers a tool or touches the system prompt: every behaviour
 * rides on tool_call (block / patch input) and tool_result (append text), so the
 * model sees no new schema and no new instructions until a guard actually fires.
 */
import { readFileSync, statSync } from "node:fs";
import { relative, sep } from "node:path";
import { checkBash, DEFAULT_ALLOW } from "./fence.ts";
import { EditError, fuzzyEdit, resolveQuery, whitespaceHits } from "./matching.ts";
import { confine, expandUserPath, isInside, JailError, realpathLenient } from "./paths.ts";
import { RepeatGuard } from "./repeat.ts";

export interface AlphariusConfig {
	/** Repo root. Default: $ALPHARIUS_ROOT, else the cwd Pi started in. */
	root?: string;
	fence: boolean;
	jail: boolean;
	repeat: boolean;
	editRescue: boolean;
	pathHint: boolean;
	repeatThreshold: number;
	repeatWindow: number;
	/** Absolute paths bash may name even though they are outside the root. */
	allowPaths: string[];
	/**
	 * Seconds applied to a bash call the model sent without `timeout` (Pi's bash tool has
	 * "no default timeout"). 0 = off. Measured 2026-09-23: twice a model ran a deadlocking
	 * binary without one and the whole run hung until killed.
	 */
	bashTimeout: number;
}

const off = (v: string | undefined) => v !== undefined && /^(0|off|false|no)$/i.test(v.trim());

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AlphariusConfig {
	const all = off(env.ALPHARIUS);
	const extra = (env.ALPHARIUS_ALLOW_PATHS ?? "").split(":").filter(Boolean);
	return {
		root: env.ALPHARIUS_ROOT || undefined,
		fence: !all && !off(env.ALPHARIUS_FENCE),
		jail: !all && !off(env.ALPHARIUS_JAIL),
		repeat: !all && !off(env.ALPHARIUS_REPEAT),
		editRescue: !all && !off(env.ALPHARIUS_EDIT_RESCUE),
		pathHint: !all && !off(env.ALPHARIUS_PATH_HINT),
		repeatThreshold: Number(env.ALPHARIUS_REPEAT_THRESHOLD) || 3,
		repeatWindow: Number(env.ALPHARIUS_REPEAT_WINDOW) || 10,
		allowPaths: [...DEFAULT_ALLOW, ...extra],
		bashTimeout: all ? 0 : env.ALPHARIUS_BASH_TIMEOUT === undefined ? 120 : Math.max(0, Number(env.ALPHARIUS_BASH_TIMEOUT) || 0),
	};
}

/** Tools whose `path` argument is jailed. grep/find/ls are off by default in Pi but covered if enabled. */
export const PATH_TOOLS = new Set(["read", "write", "edit", "grep", "find", "ls"]);

type TextBlock = { type: "text"; text: string };
type Content = Array<TextBlock | { type: string; [k: string]: unknown }>;

export interface ToolCallEventLike {
	toolName: string;
	toolCallId: string;
	input: Record<string, unknown>;
}
export interface ToolResultEventLike {
	toolName: string;
	toolCallId: string;
	input: Record<string, unknown>;
	content: Content;
	isError: boolean;
}
export interface CtxLike {
	cwd?: string;
	hasUI?: boolean;
	ui?: { notify?: (msg: string, level: "info" | "warning" | "error") => void };
}

// --- Pi's own edit normalisation, mirrored so we only step in where Pi would fail ---

function normalizeForFuzzyMatch(text: string): string {
	return text
		.normalize("NFKC")
		.split("\n")
		.map((l) => l.trimEnd())
		.join("\n")
		.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
		.replace(/[\u201C\u201D\u201E\u201F]/g, '"')
		.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
		.replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
}
const toLF = (s: string) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
function piWouldFind(content: string, oldText: string): boolean {
	return content.includes(oldText) || normalizeForFuzzyMatch(content).includes(normalizeForFuzzyMatch(oldText));
}
function readNormalized(abs: string): string | null {
	try {
		if (!statSync(abs).isFile()) return null;
		const raw = readFileSync(abs, "utf-8");
		return toLF(raw.startsWith("\uFEFF") ? raw.slice(1) : raw);
	} catch {
		return null;
	}
}

type Edit = { oldText: string; newText: string };
function editsOf(input: Record<string, unknown>): Edit[] {
	const out: Edit[] = [];
	let edits = input.edits;
	if (typeof edits === "string") {
		try {
			edits = JSON.parse(edits);
		} catch {}
	}
	if (edits && !Array.isArray(edits) && typeof edits === "object") edits = [edits];
	if (Array.isArray(edits))
		for (const e of edits)
			if (e && typeof e.oldText === "string") out.push({ oldText: e.oldText, newText: String(e.newText ?? "") });
	if (typeof input.oldText === "string") out.push({ oldText: input.oldText, newText: String(input.newText ?? "") });
	return out;
}

const textOf = (content: Content) =>
	content
		.filter((c): c is TextBlock => c.type === "text" && typeof (c as TextBlock).text === "string")
		.map((c) => c.text)
		.join("\n");

export function createAlpharius(config: AlphariusConfig = configFromEnv()) {
	const guard = new RepeatGuard(config.repeatThreshold, config.repeatWindow);
	const rescued = new Map<string, number[]>();
	let frozenRoot: string | undefined;

	// The root is fixed at first use: config.root ($ALPHARIUS_ROOT), else the cwd
	// Pi started in. Freezing it means a later `cd` cannot move the jail.
	const rootFor = (ctx?: CtxLike) => {
		frozenRoot ??= config.root ?? ctx?.cwd ?? process.cwd();
		return frozenRoot;
	};
	const cwdFor = (ctx?: CtxLike) => ctx?.cwd ?? rootFor(ctx);
	const notify = (ctx: CtxLike | undefined, msg: string) => {
		if (ctx?.hasUI && ctx.ui?.notify) ctx.ui.notify(`alpharius: ${msg}`, "warning");
	};

	function onToolCall(event: ToolCallEventLike, ctx?: CtxLike): { block: true; reason: string } | undefined {
		const root = rootFor(ctx);
		const cwd = cwdFor(ctx);
		const input = event.input ?? {};
		const repeatMsg = config.repeat ? guard.check(event.toolName, input) : null;

		let reason: string | null = null;
		if (config.fence && event.toolName === "bash") {
			const v = checkBash(String(input.command ?? ""), root, cwd, config.allowPaths);
			if (v) reason = v.reason;
		}
		if (!reason && config.jail && PATH_TOOLS.has(event.toolName) && typeof input.path === "string") {
			try {
				confine(root, input.path, cwd);
			} catch (e) {
				if (e instanceof JailError) reason = e.message;
				else throw e;
			}
		}
		if (reason || repeatMsg) {
			const full = [reason, repeatMsg].filter(Boolean).join("\n");
			notify(ctx, `blocked ${event.toolName}: ${full.split("\n")[0]}`);
			return { block: true, reason: full };
		}

		// A bash call with no timeout gets the default, so a hanging command (a deadlocked binary,
		// a server started in the foreground) costs minutes, not the run. The model's own value wins.
		if (config.bashTimeout > 0 && event.toolName === "bash" && input.timeout === undefined) {
			input.timeout = config.bashTimeout;
		}

		// Tier 2 of the anchored edit: an anchor Pi cannot find, but which matches
		// exactly one line window when whitespace is ignored, is rewritten to the
		// file's real text before Pi executes. Same semantics as exoskeleton's
		// fuzzy tier: the whole matched line window is replaced by newText.
		if (config.editRescue && event.toolName === "edit" && typeof input.path === "string") {
			const content = readNormalized(expandUserPath(input.path, cwd));
			const edits = Array.isArray(input.edits) ? (input.edits as Edit[]) : null;
			if (content !== null && edits) {
				const fixed: number[] = [];
				edits.forEach((e, i) => {
					if (!e || typeof e.oldText !== "string" || !e.oldText) return;
					const oldText = toLF(e.oldText);
					if (piWouldFind(content, oldText)) return;
					const hits = whitespaceHits(content, oldText);
					if (hits.length === 1) {
						e.oldText = hits[0]!.segment;
						fixed.push(i);
					}
				});
				if (fixed.length) rescued.set(event.toolCallId, fixed);
			}
		}
		return undefined;
	}

	function onToolResult(event: ToolResultEventLike, ctx?: CtxLike): { content: Content } | undefined {
		const root = rootFor(ctx);
		const cwd = cwdFor(ctx);
		const input = event.input ?? {};
		const extra: string[] = [];

		if (config.repeat && !event.isError && (event.toolName === "write" || event.toolName === "edit")) guard.reset();

		const fixed = rescued.get(event.toolCallId);
		rescued.delete(event.toolCallId);
		if (fixed && !event.isError) {
			extra.push(`[anchor for edits[${fixed.join("], edits[")}] matched ignoring whitespace; whole lines replaced]`);
		}

		const text = event.isError ? textOf(event.content) : "";

		if (config.editRescue && event.isError && event.toolName === "edit" && /Could not find/.test(text)) {
			const p = typeof input.path === "string" ? input.path : "";
			let content: string | null = null;
			try {
				content = readNormalized(confine(root, p, cwd));
			} catch {}
			const edits = editsOf(input);
			if (content !== null && edits.length) {
				const m = /edits\[(\d+)\]/.exec(text);
				const idxs = m ? [Number(m[1])] : edits.map((_, i) => i).filter((i) => !piWouldFind(content!, toLF(edits[i]!.oldText)));
				for (const i of idxs) {
					const e = edits[i];
					if (!e) continue;
					try {
						fuzzyEdit(content, toLF(e.oldText), e.newText);
					} catch (err) {
						if (err instanceof EditError) extra.push(edits.length > 1 ? `edits[${i}]: ${err.message}` : err.message);
					}
				}
			}
		}

		if (
			config.pathHint &&
			event.isError &&
			(event.toolName === "read" || event.toolName === "edit") &&
			/ENOENT|no such file/i.test(text) &&
			typeof input.path === "string"
		) {
			extra.push(pathHint(root, cwd, input.path));
		}

		if (!extra.length) return undefined;
		return { content: [...(event.content ?? []), { type: "text", text: extra.join("\n\n") }] };
	}

	return {
		onToolCall,
		onToolResult,
		guard,
		config,
		root: () => rootFor(),
	};
}

/** Phantom-path hint: up to 3 fuzzy candidates from the repo (exoskeleton find_file logic). */
export function pathHint(root: string, cwd: string, userPath: string): string {
	const realRoot = realpathLenient(root);
	const abs = realpathLenient(expandUserPath(userPath, cwd));
	let query = userPath.replace(/^@/, "").replace(/^\.\//, "");
	if (isInside(realRoot, abs)) query = relative(realRoot, abs).split(sep).join("/");
	const hits = resolveQuery(realRoot, query, 3);
	if (!hits.length) {
		return `No file in the project resembles '${userPath}'. It may not exist; do not search outside the project.`;
	}
	return `'${userPath}' does not exist. Closest files in the project:\n${hits.map((h) => `  ${h.path}`).join("\n")}`;
}
