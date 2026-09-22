/**
 * A fake, fully offline "model" for smoke.sh: a Pi provider whose stream
 * replays a fixed script of tool calls, one per turn, then says "done". It lets
 * the real Pi agent loop drive the real built-in tools through the Alpharius
 * hooks with no network and no GPU. At the end it writes every tool result it
 * was shown (i.e. exactly what a model would see) to $ALPHARIUS_E2E_OUT.
 */
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFileSync } from "node:fs";

const SCRIPT: Array<{ name: string; arguments: Record<string, unknown> }> = [
	{ name: "bash", arguments: { command: "find /home -name mind-vault" } },
	{ name: "bash", arguments: { command: "cat ../../etc/hostname" } },
	{ name: "read", arguments: { path: "/etc/hostname" } },
	{ name: "bash", arguments: { command: "echo loop" } },
	{ name: "bash", arguments: { command: "echo  loop" } },
	{ name: "bash", arguments: { command: "echo loop" } },
	{ name: "read", arguments: { path: "harness/contract.md" } },
	{ name: "edit", arguments: { path: "conv.py", edits: [{ oldText: "return celsius * 1.8 - 32", newText: "x" }] } },
	{ name: "edit", arguments: { path: "conv.py", edits: [{ oldText: "return c*9/5 - 32", newText: "    return c * 9 / 5 + 32" }] } },
];

export default function (pi: ExtensionAPI) {
	pi.registerProvider("alpharius-script", {
		baseUrl: "http://127.0.0.1:9/unused",
		apiKey: "none",
		api: "alpharius-script",
		models: [
			{
				id: "script",
				name: "scripted tool calls",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 32768,
				maxTokens: 1024,
			},
		],
		streamSimple: (model: any, context: any) => {
			const stream = createAssistantMessageEventStream();
			const msgs: any[] = context.messages ?? [];
			const turn = msgs.filter((m) => m.role === "assistant").length;
			const output: any = {
				role: "assistant",
				content: [],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				stopReason: "pending",
				timestamp: Date.now(),
			};
			queueMicrotask(() => {
				stream.push({ type: "start", partial: output });
				const step = SCRIPT[turn];
				if (step) {
					const toolCall = { type: "toolCall", id: `call_${turn}`, name: step.name, arguments: step.arguments };
					output.content.push(toolCall);
					output.stopReason = "toolUse";
					stream.push({ type: "toolcall_start", contentIndex: 0, partial: output });
					stream.push({ type: "toolcall_end", contentIndex: 0, toolCall, partial: output });
					stream.push({ type: "done", reason: "toolUse", message: output });
				} else {
					const results = msgs
						.filter((m) => m.role === "toolResult")
						.map((m) => ({
							tool: m.toolName,
							isError: m.isError,
							text: (m.content ?? []).map((c: any) => c.text ?? "").join("\n"),
						}));
					if (process.env.ALPHARIUS_E2E_OUT) writeFileSync(process.env.ALPHARIUS_E2E_OUT, JSON.stringify(results, null, 1));
					output.content.push({ type: "text", text: "done" });
					output.stopReason = "stop";
					stream.push({ type: "text_start", contentIndex: 0, partial: output });
					stream.push({ type: "text_end", contentIndex: 0, content: "done", partial: output });
					stream.push({ type: "done", reason: "stop", message: output });
				}
			});
			return stream;
		},
	} as any);
}
