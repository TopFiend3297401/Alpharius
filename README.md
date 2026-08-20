# Alpharius

A toolkit and knowledge base for making very small local models — extreme low-bit quantisations
like Bonsai-27B at 1.125 bpw — genuinely usable as coding agents in [OpenCode](https://opencode.ai).

## Thesis

Small models do not mainly fail at reasoning. They fail at tool mechanics: stale edits, wrong
paths, hallucinated tools, repeated calls, narrated-but-never-emitted actions, and losing the
referent of an instruction mid-loop. Most of that can be bought back with structure *outside*
the model — grounding files, permission fences, external verification, and tools designed to be
forgiving. This repo documents what works, ships the configs, and builds the tooling.

Born from Coppice, a companion benchmark measuring multi-turn agentic degradation of low-bit
quantised models (not yet published). Alpharius is the "make it better" half; Coppice is the
"measure it" half.

## Layout

- `vault/` — Obsidian vault, split-brain:
  - `vault/docs/` — stable, community-facing knowledge. Verified claims only, dated.
  - `vault/dev/` — working notes, designs in flight, roadmap. Volatile.
  - Notes are promoted from dev to docs once verified. Start at `vault/Home.md`.
- `projects/` — runnable and shippable pieces:
  - `projects/opencode-configs/` — copy-paste hardened configs for running small models in OpenCode.
  - `projects/exoskeleton-mcp/` — an MCP server that compensates for small-model tool-mechanics
    failures (design stage).
- `skills/` — agent skills in the standard `SKILL.md` format, usable from OpenCode and Claude
  Code alike. Install via the [Agent Skills Directory](https://skills.sh):

  ```
  npx skills add TopFiend3297401/Alpharius
  ```

  - `harden-opencode` — ground, fence and verify an OpenCode project for a small model.
  - `brief-small-models` — write task briefs a small model can actually execute.
- `AGENTS.md`, `opencode.json` — this repo practises what it preaches; agents working here are
  grounded and fenced by the same mechanisms the docs describe.

## Status

Foundation laid 2026-08-20. Early; contributions and replication reports welcome once published.
