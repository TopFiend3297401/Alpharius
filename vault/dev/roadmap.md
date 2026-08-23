Projects, status, and next actions. Working note — expect churn. Dates absolute.

## P1 — opencode-configs and skills (shippable now)

- Hardened `opencode.json` and `AGENTS.md` template. Foundation shipped 2026-08-20 in `projects/opencode-configs/`.
- Two skills shipped 2026-08-20 in `skills/` (format and distribution: [[skills-distribution]]): `harden-opencode`, `brief-small-models`. Installable via `npx skills add TopFiend3297401/Alpharius`.
- Battle-tested 2026-08-21 on a cold-start Rust build: [[case-study-the-launcher-build]]. The fence held completely — no wander, no out-of-repo access, against the same model that produced [[case-study-the-vault-hunt]]. Grounding and fencing are earning their keep.
- Next: fold back what that run exposed (build-graph reachability, confabulated blockers); consider a third skill for the exoskeleton once P2 exists.

## P2 — exoskeleton MCP server (v0.1.0 built 2026-08-20)

- Design: [[exoskeleton-mcp-design]]. Implementation: `projects/exoskeleton-mcp/exoskeleton.py` — zero-dependency Python, 28 tests, TDD. Tools: find_file, read_file, edit_file; behaviours: repo jail, repeat detection, state echo.
- **Scope cut 2026-08-23:** repo jail and repeat detection are already native to OpenCode 1.18.19 (`external_directory`, `doom_loop`) — measured in [[opencode-tool-surface]]. Build the anchored fuzzy edit and the path resolver; drop the other two.
- Next: live smoke test with a real small model driving OpenCode; then modern-era (`_meta`, 2026-07-28) protocol support; then the P4 measurement.
- New candidate behaviour from [[case-study-the-launcher-build]]: assert that files written this session are reachable from a crate root. Bonsai wrote 517 of 736 lines outside the build graph and no mandated cargo command could see them, because unreferenced files are not targets.

## P3 — transcript analyser (blocked on spec)

- A standalone parser that reads an OpenCode transcript and emits per-category malformation counts from [[failure-taxonomy]].
- Shared need with the Coppice benchmark. Blocked: the per-category detection rules must be pinned first (they are open questions in Coppice's methodology). One fact, one home — rules get written there, implementation can live here.

## P4 — measure what the scaffolding buys (idea)

- Stock OpenCode tools versus exoskeleton, same model, same tasks: how much capability does structure buy back from quantisation?
- This is a harness variable for the Coppice benchmark: needs a frontmatter property (e.g. `toolset: stock | assisted`) and a methodology entry there — a deliberate change, never a quiet one.
- Same design measures the LSP effect (on/off), including the context-crowding caveat in [[lsp-external-verification]].

## P2b — grounding via `instructions` + a `/ground` command (shipped on Origin 2026-08-23, not yet in the repo)

- OpenCode's `instructions` config key puts a file's contents in the **system prompt of every session**, measured in [[opencode-tool-surface]]. A tool inventory delivered that way needs no invocation and no memory — the cheapest grounding lever found so far.
- A `/ground` command replaces the built-in `/init`: one fixed `bash` call to a fact-gathering script, then one `write`. The model does no exploration, so an entire class of tool-mechanics failure never gets the chance to happen.
- ⚠️ The first version used backtick shell injection in the command template, which **silently does not expand** — the model receives literal shell text. See [[opencode-tool-surface]]. Caught by capturing the real request, not by reading the output.
- Next: generalise both into `projects/opencode-configs/` so they ship, and measure whether the inventory changes hallucinated-tool rates (a P4 variable).

## P5 — upstream feedback (later)

- Anything generally useful discovered here goes back to the OpenCode project as issues or PRs: small-model ergonomics, permission examples, repeat-call detection in the loop.

## Open questions

- Repo publication: when, and does the Coppice benchmark publish alongside or later?
- Which small models beyond Bonsai to cover so the docs generalise (ternary variants, other sub-2-bpw quants)?
- Does [[failure-taxonomy]]'s core claim — mechanics fail before reasoning — survive fencing? The 2026-08-21 run suggests the taxonomy measures what fails *first*, and that reasoning and cross-file coherence are what remain once mechanics are propped up. Needs a second observation before it changes the docs.
