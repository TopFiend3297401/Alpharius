/**
 * Alpharius exoskeleton for Pi — fence, repo jail, repeat guard, anchored edit
 * rescue and phantom-path hints, all as invisible hooks. Registers no tool and
 * does not touch the system prompt, so it adds zero prompt tokens; the model
 * only sees text when a guard fires. See README.md.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configFromEnv, createAlpharius } from "./lib/alpharius.ts";

export default function (pi: ExtensionAPI) {
	const a = createAlpharius(configFromEnv());

	pi.on("session_start", async (_event, ctx) => {
		// Seed the root with the cwd Pi started in unless ALPHARIUS_ROOT set it.
		if (!a.config.root) a.config.root = ctx.cwd;
	});

	pi.on("tool_call", async (event, ctx) => a.onToolCall(event as never, ctx as never));
	pi.on("tool_result", async (event, ctx) => a.onToolResult(event as never, ctx as never) as never);

	// A user-side slash command: never sent to the model, costs no prompt tokens.
	pi.registerCommand("alpharius", {
		description: "Show Alpharius guard status",
		handler: async (_args, ctx) => {
			const c = a.config;
			const on = (b: boolean) => (b ? "on" : "off");
			ctx.ui.notify(
				`alpharius root=${a.root()} fence=${on(c.fence)} jail=${on(c.jail)} ` +
					`repeat=${on(c.repeat)}(${c.repeatThreshold}/${c.repeatWindow}) ` +
					`editRescue=${on(c.editRescue)} pathHint=${on(c.pathHint)}`,
				"info",
			);
		},
	});
}
