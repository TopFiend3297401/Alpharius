Projects, status, and next actions. Working note — expect churn. Dates absolute.

## P1 — opencode-configs and skills (shippable now)

- Hardened `opencode.json` and `AGENTS.md` template. Foundation shipped 2026-08-20 in `projects/opencode-configs/`.
- Two skills shipped 2026-08-20 in `skills/` (format and distribution: [[skills-distribution]]): `harden-opencode`, `brief-small-models`. Installable via `npx skills add TopFiend3297401/Alpharius`.
- Next: battle-test on our own repos ([[opencode-hardening-checklist]]), fold back anything learned; consider a third skill for the exoskeleton once P2 exists.

## P2 — exoskeleton MCP server (design stage)

- Design: [[exoskeleton-mcp-design]]. Implementation home: `projects/exoskeleton-mcp/`.
- Next: decide language and MCP SDK; build the two highest-value tools first (anchored fuzzy edit, path resolver); wire into OpenCode via verified `mcp` config syntax.

## P3 — transcript analyser (blocked on spec)

- A standalone parser that reads an OpenCode transcript and emits per-category malformation counts from [[failure-taxonomy]].
- Shared need with the Coppice benchmark. Blocked: the per-category detection rules must be pinned first (they are open questions in Coppice's methodology). One fact, one home — rules get written there, implementation can live here.

## P4 — measure what the scaffolding buys (idea)

- Stock OpenCode tools versus exoskeleton, same model, same tasks: how much capability does structure buy back from quantisation?
- This is a harness variable for the Coppice benchmark: needs a frontmatter property (e.g. `toolset: stock | assisted`) and a methodology entry there — a deliberate change, never a quiet one.
- Same design measures the LSP effect (on/off), including the context-crowding caveat in [[lsp-external-verification]].

## P5 — upstream feedback (later)

- Anything generally useful discovered here goes back to the OpenCode project as issues or PRs: small-model ergonomics, permission examples, repeat-call detection in the loop.

## Open questions

- Repo publication: when, and does the Coppice benchmark publish alongside or later?
- Which small models beyond Bonsai to cover so the docs generalise (ternary variants, other sub-2-bpw quants)?
