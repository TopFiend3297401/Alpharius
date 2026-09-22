/**
 * Repeat guard — the exoskeleton's RepeatDetector, adapted to a harness that
 * owns every tool (bash included, which OpenCode's doom_loop missed on 1.18.31).
 *
 * Rule: a call is blocked when the same (tool, canonical args) appears for the
 * `threshold`-th time within the last `window` calls. The history is cleared by
 * a successful write/edit, because re-running `npm test` or re-reading a file
 * after changing something is progress, not a loop. Blocked calls still enter
 * the history, so a model that keeps hammering stays blocked.
 *
 * Differences from exoskeleton.py (which counted forever, per server lifetime):
 * the window and the reset-on-change, both to avoid false positives across a
 * long Pi session where the same test command is legitimately run many times.
 */

export const REPEAT_REASON = "same call three times — change approach or finish";

/** JSON with keys sorted at every level (Python json.dumps(sort_keys=True) analogue). */
export function stableStringify(v: unknown): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
	if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
	const o = v as Record<string, unknown>;
	return `{${Object.keys(o)
		.filter((k) => o[k] !== undefined)
		.sort()
		.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
		.join(",")}}`;
}

/** Canonical key. bash: whitespace-collapsed command, timeout ignored (bumping a timeout is still a loop). */
export function callKey(toolName: string, input: unknown): string {
	if (toolName === "bash" && input && typeof input === "object") {
		const cmd = String((input as { command?: unknown }).command ?? "")
			.trim()
			.replace(/\s+/g, " ");
		return `bash\u0000${cmd}`;
	}
	return `${toolName}\u0000${stableStringify(input)}`;
}

export class RepeatGuard {
	threshold: number;
	window: number;
	history: string[] = [];

	constructor(threshold = 3, window = 10) {
		this.threshold = threshold;
		this.window = window;
	}

	/** Record the call; return the block message if it is the threshold-th repeat. */
	check(toolName: string, input: unknown): string | null {
		const key = callKey(toolName, input);
		this.history.push(key);
		if (this.history.length > this.window) this.history.splice(0, this.history.length - this.window);
		const n = this.history.filter((k) => k === key).length;
		if (n >= this.threshold) {
			return (
				`${REPEAT_REASON[0]!.toUpperCase()}${REPEAT_REASON.slice(1)}. ` +
				`This is identical call number ${n} in the last ${this.history.length} — the same tool with the ` +
				`same arguments. Repeating it will give the same result. Stop, re-read the previous result, ` +
				`and change something: the arguments, the tool, or the plan.`
			);
		}
		return null;
	}

	reset(): void {
		this.history = [];
	}
}
