/**
 * Dumps what the model would be given — the system prompt and every tool
 * definition — at session_start, to $PROBE_OUT. smoke.sh runs it with and
 * without Alpharius and diffs the two: identical output = zero added tokens.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFileSync } from "node:fs";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_e, ctx) => {
		const tools = pi.getAllTools().map((t: any) => ({ name: t.name, description: t.description, parameters: t.parameters }));
		writeFileSync(process.env.PROBE_OUT!, JSON.stringify({ system: ctx.getSystemPrompt(), tools }, null, 1));
	});
}
