---
name: harden-opencode
description: Use when setting up or auditing an OpenCode project that a small or local model will drive (low-bit quantised models especially), or when a small model wanders outside the repo, runs unexpected commands, or breaks files silently. Grounds referents with AGENTS.md, fences bash and webfetch permissions in opencode.json, enables LSP diagnostics, and verifies the result with a wander probe.
license: MIT
---

# Harden an OpenCode project for a small model

> **Harness scope.** Steps 2–4 are OpenCode-specific. The requirements carry over; the mechanisms
> do not. DeepSeek Harness's bwrap sandbox (`workspace-write`) confines bash structurally, which
> OpenCode's pattern fence cannot; Pi has no fence without a `tool_call` extension. See
> `vault/docs/harnesses-are-a-variable.md` in the Alpharius repository.

> ⚠️ **See `opencode-init` first.** It supersedes this skill for new work, adding the three things
> measured to matter most on 2026-09-20: the oracle must live **outside** the repository, ambition
> must be stated in prose, and "done" must mean a real end-to-end test rather than a health check.
> This skill remains correct for Steps 1–2 (grounding and fencing) and for the wander probe.

Small models fail at tool mechanics and referent resolution more than at reasoning. Grounding
reduces the wish to wander; the fence removes the ability; LSP makes the model's own breakage
visible to it. Apply all three, then verify.

## Step 1 — Ground the referents (AGENTS.md)

Create `AGENTS.md` in the repo root (OpenCode reads it natively). It must pin:

- the absolute path of the repository
- the meaning of every load-bearing noun task prompts will use ("the vault means
  `<abs-path>/vault`; no other directory of that name, on this machine or any other, is relevant")
- the boundary: work only inside this repository; never use ssh, scp or rsync
- house rules the model must not invent (language variant, no package installs)

Keep it short: every line competes for the model's limited attention. Use absolute paths in task
prompts for any file the model must read before it has its bearings.

## Step 2 — Fence the shell (opencode.json)

Create `opencode.json` in the repo root. Rules are pattern-matched and the LAST matching rule
wins, so the wildcard goes first:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": true,
  "permission": {
    "bash": {
      "*": "allow",
      "ssh *": "deny",
      "scp *": "deny",
      "rsync *": "deny",
      "find / *": "ask",
      "find /home*": "ask"
    },
    "webfetch": "deny"
  }
}
```

Caution: OpenCode refuses to start on any config key its installed version does not know. An
earlier version of this skill said a `webfetch` block failed; that was true of 1.18.19 only and
is verified working on 1.18.25 and 1.18.31. If the session dies with ConfigInvalidError, bisect
the config keys with `opencode models` in a scratch directory.

- Deny network escape outright: a local agent has no business leaving the machine.
- Filesystem-wide sweeps are "ask", not "deny" — the interrupt itself signals the model has lost
  its anchor.
- Tighten per repo as needed, e.g. `"git push *": "deny"`.

## Step 3 — LSP as external verification

`"lsp": true` (already in the config above) enables OpenCode's built-in language servers;
Pyright auto-installs for Python projects, similarly for TypeScript and others. Diagnostics are
fed back to the agent after edits, converting silent breakage into immediate textual feedback.
⚠️ **Enabling is not running** (measured 2026-09-22): `"lsp": true` was inert for Rust because
`rust-analyzer` was not installed, and nothing said so. Confirm in `opencode.log` that a language
server actually started. Caveat: diagnostics cost context tokens every turn — on a model with a tight effective context,
watch for the task being crowded out.

## Step 4 — Verify with a wander probe

Restart the OpenCode session (config is read at startup). Then give the model a task referencing
a repo file by a resolvable relative path, and separately one referencing a plausible but wrong
path. Confirm: it recovers using the AGENTS.md grounding rather than searching the filesystem,
and any `find /` or ssh attempt is interrupted by the fence. Only then hand it real work.
