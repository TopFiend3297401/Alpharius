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
  - `projects/opencode-configs/` — copy-paste hardened configs for running small models in OpenCode,
    plus the grounding layer: an always-on tool inventory and a `/ground` command.
  - `projects/exoskeleton-mcp/` — an MCP server that compensates for small-model tool-mechanics
    failures (design stage).
- `skills/` — agent skills in the standard `SKILL.md` format, usable from OpenCode and Claude
  Code alike. Install via the [Agent Skills Directory](https://skills.sh):

  ```
  npx skills add TopFiend3297401/Alpharius
  ```

  - `opencode-init` — **start here.** The full pre-flight: ground, fence, brief, and a *hidden*
    oracle. Supersedes `harden-opencode` by adding the oracle-placement rule, an ambition
    statement, MCP-sourced facts with provenance, and an end-to-end definition of done.
  - `harden-opencode` — ground, fence and verify an OpenCode project for a small model.
  - `brief-small-models` — write task briefs a small model can actually execute.
- `AGENTS.md`, `opencode.json` — this repo practises what it preaches; agents working here are
  grounded and fenced by the same mechanisms the docs describe.

## Not only OpenCode

Alpharius began as an OpenCode toolkit. A three-harness comparison on 2026-09-22 (OpenCode, Pi,
DeepSeek Harness) found that most of what it documents is a harness-agnostic requirement that
OpenCode happens to meet through config, and that no harness separated on score at that sample
size — while how the brief was delivered, and whether an external oracle graded the result, did
matter. See [`vault/docs/harnesses-are-a-variable.md`](vault/docs/harnesses-are-a-variable.md).
Work in progress on that front: a Pi extension (`projects/pi-extension/`) and an oracle gate for
DeepSeek Harness's `/goal` (`projects/dsh-oracle-gate/`).

## Status

Foundation laid 2026-08-20. Early; contributions and replication reports welcome once published.
