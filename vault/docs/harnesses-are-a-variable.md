The harness is a variable, not a constant. Measured 2026-09-22: eleven runs of Occamy-1.0 on one Rust maintenance task, graded by a hidden 15-check oracle ([[the-oracle-must-be-hidden]]), across three harnesses — OpenCode 1.18.32, Pi 0.87.0 and DeepSeek Harness (DSH) 0.1.5-rc.3. Same model, same task.

Everything below is a measurement unless marked otherwise. Sample sizes are small (n=3–4 per harness); treat score differences as noise until shown otherwise.

## What each harness sends

| | Pi 0.87.0 | DSH 0.1.5-rc.3 | OpenCode 1.18.32 |
|---|---|---|---|
| First-request size | 2.5k tokens | 13.2k tokens | 22.3k tokens |
| Tools offered | 4 | 50 | 37 (incl. 25 MCP tools) |
| `reasoning_effort` sent | yes | no (configured value ignored) | no |
| Mean score /15 | 13.7 | 12.7 | 13.5 |

- The OpenCode figure includes 25 estate MCP tools and the Alpharius tool inventory injected via `instructions` ([[opencode-tool-surface]]). A bare OpenCode install sends less.
- **No harness separates at this sample size.** A ninefold difference in first-request size produced a 0.2-point difference between Pi and OpenCode. The extra surface did not measurably help or hurt on this task; it is still context a small model does not get back.
- DSH had a `reasoningEffort` configured and did not send it. If reasoning budget matters, verify it in the captured request, not the config.

## How the Alpharius artefacts map across harnesses

| Alpharius artefact | OpenCode | Pi | DSH |
|---|---|---|---|
| Grounding file | `AGENTS.md`, read natively | not established | not established |
| Always-on tool inventory | `instructions` key → system prompt | extension (not built) | plugin (not built) |
| Repo jail for path tools | `external_directory`, native | none without an extension | bwrap sandbox |
| Fence for `bash` | pattern list only ([[fencing-the-shell]]) | none without an extension | bwrap `workspace-write` confines bash structurally (and breaks ssh) |
| Repeat detection | `doom_loop` — did **not** catch bash loops on 1.18.31 | `tool_call` extension hook — in progress at `projects/pi-extension/` | `repeat-tool-reminder`, native, covers bash |
| LSP diagnostics | `"lsp": true` — inert for Rust without `rust-analyzer` ([[lsp-external-verification]]) | not measured | not measured |
| Oracle-gated completion | none; oracle run by hand | none | `/goal` is self-certified; an oracle-gated plugin is in progress at `projects/dsh-oracle-gate/` |

The pattern: the same behaviour lives at a different layer in each harness. OpenCode puts most of it in config, Pi in extensions, DSH in native features and plugins. A technique documented as "an OpenCode config key" is really a requirement — *the model must see its tool list*, *bash must not leave the workspace*, *identical calls must be interrupted* — and each harness meets it differently or not at all.

## The finding no harness prevents: self-certified completion

Six runs failed the criterion "the binary reports alerts". **All six claimed it passed** — often after diagnosing the cause in their own transcript and arguing it away. It is now the seventh category in [[failure-taxonomy]]: the model's account of done is not evidence; only an external oracle is.

DSH makes the problem structural. Its `/goal` completes when the model calls `update_goal` with a complete status — the model grades itself. One run quit on round 1 with false claims of success. Gating that call on an oracle is the fix being built at `projects/dsh-oracle-gate/`.

## How the brief is delivered changes the score

Same task, same model, different delivery of the same brief:

| Delivery | Mean /15 |
|---|---|
| Model told to read `BRIEF.md` | 12.5 |
| `BRIEF.md` pasted verbatim | 13.2 |
| Condensed paste, acceptance criteria restated as observable outputs | 15 (n=1) |

- **Paste the brief; do not only point at it.** Keep the file on disk as well, because a pasted brief does not survive compaction (the `opencode-init` skill).
- **Restate each acceptance criterion as an observable output.** Not "the binary reports alerts" but "running the binary prints `N alert(s):` with N ≥ 1". An observable output is something the model can check by running a command and reading the result; a property is something it can argue about. The n=1 result is suggestive, not established.

## Thinking models need output room

On one OpenCode run the 8192-token output cap was consumed entirely by reasoning (`finish=length`), and `opencode run` exited with no final message at all. For a thinking model, set the output cap to at least 16k, or constrain the reasoning budget — and since only Pi sent `reasoning_effort`, the cap is the lever that works everywhere.

## What this changes

- Alpharius was written as an OpenCode toolkit. Its findings are mostly harness-agnostic requirements that happen to have been met with OpenCode config. The direction from here is to state each requirement first and the per-harness mechanism second.
- Harness choice is not where the score comes from at this sample size. Changing how the brief was delivered moved the mean further (12.5 to 15) than switching harness did (12.7 to 13.7), though both samples are small.
- Any benchmark comparing models through a harness should record the harness, its version, and the size of the first request — they differ by an order of magnitude.
