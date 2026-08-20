Map of content for the Alpharius vault. The vault is split-brain:

- `docs/` — the documentation brain. Stable, verified, written for outsiders. Every claim is dated and states how it was verified. Nothing speculative lives here.
- `dev/` — the development brain. Working notes, designs in flight, decisions not yet made. Volatile by design.

A note is promoted from dev to docs when its claims have been verified and its content has stopped moving. Promotion is a deliberate act, not drift.

## Documentation brain

- [[failure-taxonomy]] — the six tool-mechanics failure categories of small coding agents
- [[grounding-with-agents-md]] — pinning referents so the model cannot wander
- [[fencing-the-shell]] — OpenCode permission config, verified syntax
- [[lsp-external-verification]] — diagnostics in the loop as a substitute for internal coherence
- [[case-study-the-vault-hunt]] — a live wander incident, 2026-08-20, and what it teaches
- [[skills-distribution]] — the skill format, where harnesses load them from, and skills.sh

## Development brain

- [[roadmap]] — the projects, their status, and what happens next
- [[exoskeleton-mcp-design]] — design for the tool-mechanics compensation MCP server
- [[opencode-hardening-checklist]] — concrete actions for our own machines

## Elsewhere in the repo

- `projects/opencode-configs/` — shippable config templates
- `projects/exoskeleton-mcp/` — implementation home for [[exoskeleton-mcp-design]]
- `skills/` — harden-opencode and brief-small-models, in the standard SKILL.md format ([[skills-distribution]])
