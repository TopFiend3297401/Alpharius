# opencode-configs

Copy-paste configuration for running a very small local model as an OpenCode coding agent
without it wandering, escaping, or silently breaking things.

## Contents

- `opencode.hardened.json` — permission fence plus LSP diagnostics. Drop into your repo root as
  `opencode.json`. Rules are pattern-matched, last match wins; syntax verified against the
  OpenCode docs 2026-08-20.
- `AGENTS.template.md` — referent-grounding file. Copy to your repo root as `AGENTS.md` and fill
  in the placeholders. OpenCode reads it natively.

## Why both

Grounding reduces the model's wish to wander; the fence removes its ability. Small models follow
structure far more reliably than they follow instructions — use the instructions to keep the
happy path short and the structure to make the unhappy path safe. Background and evidence:
`vault/docs/` in this repo, especially the case study.
