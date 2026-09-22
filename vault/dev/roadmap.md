Projects, status, and next actions. Working note — expect churn. Dates absolute.

## P1 — opencode-configs and skills (shippable now)

- Hardened `opencode.json` and `AGENTS.md` template. Foundation shipped 2026-08-20 in `projects/opencode-configs/`.
- Two skills shipped 2026-08-20 in `skills/` (format and distribution: [[skills-distribution]]): `harden-opencode`, `brief-small-models`. Installable via `npx skills add TopFiend3297401/Alpharius`.
- Battle-tested 2026-08-21 on a cold-start Rust build: [[case-study-the-launcher-build]]. The fence held completely — no wander, no out-of-repo access, against the same model that produced [[case-study-the-vault-hunt]]. Grounding and fencing are earning their keep.
- Next: fold back what that run exposed (build-graph reachability, confabulated blockers); consider a third skill for the exoskeleton once P2 exists.

- **Third skill shipped 2026-09-20: `opencode-init`.** The full pre-flight, derived from three
  measured runs of one task on one local model. Doctrine behind it: [[the-oracle-must-be-hidden]].
  ⚠️ **`harden-opencode` is now the ancestor** and points at it; the two should be reconciled rather
  than left to drift.
- ✅ **P2b (`instructions` + `/ground`) SHIPPED to this repo 2026-09-22** — see P2b below. It was
  the single biggest gap between what ran on Origin and what this repo gave anyone else.
- 2026-09-22: skills updated with the brief-delivery rule (paste the brief; criteria as observable
  outputs), the output-cap rule (≥16k for thinking models), self-certified completion, and
  OpenCode-specific steps marked with their Pi/DSH equivalents. ⚠️ `harden-opencode` and
  `opencode-init` are still not reconciled.

## P2 — exoskeleton MCP server (v0.1.0 built 2026-08-20)

- Design: [[exoskeleton-mcp-design]]. Implementation: `projects/exoskeleton-mcp/exoskeleton.py` — zero-dependency Python, 28 tests, TDD. Tools: find_file, read_file, edit_file; behaviours: repo jail, repeat detection, state echo.
- **Scope cut 2026-08-23:** repo jail and repeat detection are already native to OpenCode 1.18.19 (`external_directory`, `doom_loop`) — measured in [[opencode-tool-surface]]. Build the anchored fuzzy edit and the path resolver; drop the other two.
- ⚠️ **HALF OF THAT SCOPE CUT HAS GONE STALE, 2026-09-21.** The repo-jail half held — `external_directory`
  caught a real cross-repo read. **The `doom_loop` half did not**: four byte-identical `podman ps` /
  `podman logs` calls ran unimpeded on OpenCode **1.18.31**, against containers that did not exist.
  Either the default changed since 1.18.19 or it does not catch this shape. ⛔ **A scope cut justified
  by "the platform does this natively" needs re-testing whenever the platform version moves.**
- ⛔ **And restoring `RepeatDetector` would NOT have caught it — a design gap worth naming.** The
  exoskeleton guards `find_file` / `read_file` / `edit_file`. **Loops happen in `bash`**, because a
  loop is a repeated *state check*, and state checks are shell calls. An MCP server can only protect
  the tools it wraps. Options: give the exoskeleton a `run_command` tool and fence `bash` so shell
  traffic routes through it (real work, real cost), or state the rule in the brief (free, now shipped
  in `opencode-init`). The prompt-level fix went in first; the architectural one is unbuilt.
- Next: live smoke test with a real small model driving OpenCode; then modern-era (`_meta`, 2026-07-28) protocol support; then the P4 measurement.
- New candidate behaviour from [[case-study-the-launcher-build]]: assert that files written this session are reachable from a crate root. Bonsai wrote 517 of 736 lines outside the build graph and no mandated cargo command could see them, because unreferenced files are not targets.

## P3 — transcript analyser (blocked on spec)

- A standalone parser that reads an OpenCode transcript and emits per-category malformation counts from [[failure-taxonomy]].
- Shared need with the Coppice benchmark. Blocked: the per-category detection rules must be pinned first (they are open questions in Coppice's methodology). One fact, one home — rules get written there, implementation can live here.

## P4 — measure what the scaffolding buys (idea)

- Stock OpenCode tools versus exoskeleton, same model, same tasks: how much capability does structure buy back from quantisation?
- This is a harness variable for the Coppice benchmark: needs a frontmatter property (e.g. `toolset: stock | assisted`) and a methodology entry there — a deliberate change, never a quiet one.
- Same design measures the LSP effect (on/off), including the context-crowding caveat in [[lsp-external-verification]].

## P2b — grounding via `instructions` + a `/ground` command (✅ SHIPPED to the repo 2026-09-22)

- OpenCode's `instructions` config key puts a file's contents in the **system prompt of every session**, measured in [[opencode-tool-surface]]. A tool inventory delivered that way needs no invocation and no memory — the cheapest grounding lever found so far.
- A `/ground` command replaces the built-in `/init`: one fixed `bash` call to a fact-gathering script, then one `write`. The model does no exploration, so an entire class of tool-mechanics failure never gets the chance to happen.
- ⚠️ The first version used backtick shell injection in the command template, which **silently does not expand** — the model receives literal shell text. See [[opencode-tool-surface]]. Caught by capturing the real request, not by reading the output.
- ✅ **Shipped 2026-09-22** as templates in `projects/opencode-configs/grounding/` (`tool-inventory.template.md`, `ground-facts.sh`, `command/ground.md`), with installation in that folder's README. The machine-specific estate tool tables were replaced by a marked example section; the inventory's `doom_loop` line was corrected for 1.18.31.
- Next: measure whether the inventory changes hallucinated-tool rates (a P4 variable). Note the cost side, measured 2026-09-22: with 25 MCP tools plus the inventory, OpenCode's first request was 22.3k tokens against Pi's 2.5k, with no score difference at n=3–4 ([[harnesses-are-a-variable]]).

## P6 — harness-agnostic Alpharius (direction set 2026-09-22)

- ✅ **Three-harness comparison DONE 2026-09-22**: OpenCode 1.18.32, Pi 0.87.0, DeepSeek Harness 0.1.5-rc.3; eleven runs of Occamy-1.0 on one Rust task, hidden 15-check oracle. Write-up: [[harnesses-are-a-variable]]. No harness separated on score (Pi 13.7, OpenCode 13.5, DSH 12.7, n=3–4); brief delivery moved the mean more. New seventh category: self-certified completion ([[failure-taxonomy]]).
- **Pi extension — in progress** at `projects/pi-extension/`: repeat detection (covering bash) and a fence via the `tool_call` hook; Pi ships neither.
- **DSH oracle gate — in progress** at `projects/dsh-oracle-gate/`: a plugin gating `/goal` completion on an external oracle, because `update_goal complete` is self-certified (one run quit on round 1 with false claims).
- **Direction:** state each Alpharius finding as a requirement first (the model sees its tool list; bash cannot leave the workspace; identical calls are interrupted; done is decided by an oracle) and the per-harness mechanism second. The docs brain still reads as an OpenCode manual; convert note by note, not in one rewrite.
- Open: does the Alpharius tool inventory (always-on in OpenCode) have an equivalent worth building for Pi and DSH, given the request-size cost?

## P5 — upstream feedback (later)

- Anything generally useful discovered here goes back to the OpenCode project as issues or PRs: small-model ergonomics, permission examples, repeat-call detection in the loop.

## Open questions

- Repo publication: when, and does the Coppice benchmark publish alongside or later?
- Which small models beyond Bonsai to cover so the docs generalise (ternary variants, other sub-2-bpw quants)?
- Does [[failure-taxonomy]]'s core claim — mechanics fail before reasoning — survive fencing? The 2026-08-21 run suggests the taxonomy measures what fails *first*, and that reasoning and cross-file coherence are what remain once mechanics are propped up. Needs a second observation before it changes the docs.
