# opencode-configs

Copy-paste configuration for running a very small local model as an OpenCode coding agent
without it wandering, escaping, or silently breaking things.

## Contents

- `opencode.hardened.json` — permission fence plus LSP diagnostics. Drop into your repo root as
  `opencode.json`. Rules are pattern-matched, last match wins; syntax verified against the
  OpenCode docs 2026-08-20. `"webfetch": "deny"` added 2026-09-22 (verified loading on 1.18.25
  and 1.18.31; it was rejected by 1.18.19, so upgrade if yours refuses it). ⚠️ `"lsp": true` does
  nothing if the language server is not installed — check `opencode.log` for it starting.
- `AGENTS.template.md` — referent-grounding file. Copy to your repo root as `AGENTS.md` and fill
  in the placeholders. OpenCode reads it natively.
- `grounding/` — the always-on grounding layer (roadmap P2b), shipped 2026-09-22:
  - `tool-inventory.template.md` — the complete list of tools the model has, delivered into the
    system prompt of every session via OpenCode's `instructions` key.
  - `ground-facts.sh` — gathers every fact needed to write an `AGENTS.md` in one fixed call.
  - `command/ground.md` — a `/ground` command: one `bash` call to that script, one `write`. Use it
    instead of the built-in `/init` with a small model.

## Why both

Grounding reduces the model's wish to wander; the fence removes its ability. Small models follow
structure far more reliably than they follow instructions — use the instructions to keep the
happy path short and the structure to make the unhappy path safe. Background and evidence:
`vault/docs/` in this repo, especially the case study.

## Installing the grounding layer (global, all projects)

```bash
mkdir -p ~/.config/opencode/alpharius ~/.config/opencode/command
cp grounding/tool-inventory.template.md ~/.config/opencode/alpharius/tool-inventory.md
cp grounding/ground-facts.sh            ~/.config/opencode/alpharius/ground-facts.sh
chmod +x ~/.config/opencode/alpharius/ground-facts.sh
cp grounding/command/ground.md          ~/.config/opencode/command/ground.md
```

Then add the inventory to your **global** `~/.config/opencode/opencode.json` (use the absolute
path; merge with any existing keys rather than replacing the file):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["/home/<you>/.config/opencode/alpharius/tool-inventory.md"]
}
```

Before relying on it, edit `tool-inventory.md`:

1. **Re-measure the built-in tool list on your OpenCode version.** The template's list was captured
   from a live request on 1.18.19. A tool inventory that promises a tool the model is not offered
   is worse than none — a small model cannot detect the discrepancy.
2. **Replace the "MCP tools — EXAMPLE SECTION"** with your own servers, or delete it if you have
   none. MCP tool names reach the model **prefixed with the server name** (`<server>_<tool>`);
   write them exactly as the model receives them.
3. Fill in the version and date line.

Restart OpenCode (config is read at session start), then run `/ground` in a project to write its
`AGENTS.md`. `/ground` calls the script by `~/.config/opencode/alpharius/ground-facts.sh`; if you
installed elsewhere, edit the path in `command/ground.md`, or set `ALPHARIUS_INVENTORY` to point
the script at a different inventory file.

Why a script and not a template with backticks: OpenCode command templates do **not** expand
backtick shell substitution — the model receives the literal shell text. See
`vault/docs/opencode-tool-surface.md`.

Cost to know about: the inventory is in every request. Measured 2026-09-22, OpenCode with 25 MCP
tools plus the inventory sent a 22.3k-token first request. See
`vault/docs/harnesses-are-a-variable.md`. Pi and DeepSeek Harness have no `instructions`
equivalent in this repo yet; the Pi work is in progress at `projects/pi-extension/`.
