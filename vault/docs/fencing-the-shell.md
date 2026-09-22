OpenCode permission configuration for running small models safely. Syntax verified against the OpenCode docs, 2026-08-20.

## Why

- Out of the box (or with a permissive config) every bash call can be auto-allowed. Observed live: a wandering model's `find /` across the whole filesystem sailed through with `action=allow pattern=*`.
- A small model will eventually emit a command you did not anticipate. The fence makes the blast radius a config decision instead of a hope.

## Syntax facts

- Actions: `"allow"`, `"ask"`, `"deny"`.
- Bash rules are pattern-matched and the **last matching rule wins** — so the `"*"` wildcard goes first, specific rules after it.
- `read` and `edit` accept the same treatment with path patterns; `webfetch` takes a single action (see the correction below).

## A sane fence for a local small model

```json
{
  "$schema": "https://opencode.ai/config.json",
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

Correction, 2026-09-20: an earlier version of this note said a `webfetch` permission block was rejected by OpenCode 1.18.19 and should be left out. That is stale. Verified on 1.18.25 and 1.18.31 with a control: `"webfetch": "deny"` loads, and `opencode models` exits 0. The fence above now denies it, as it always should have. The general caution stands: OpenCode validates the whole config against its schema and refuses to start on any key its installed version does not know. If a session dies with ConfigInvalidError, bisect the config keys with `opencode models` in a scratch directory.

- Network escape (ssh/scp/rsync, and `webfetch`) is denied outright: a local agent has no business leaving the machine. Note that denying `webfetch` does not stop `curl` in bash; add `"curl *": "deny"` and `"wget *": "deny"` where that matters.
- Filesystem-wide sweeps are `ask`, not `deny` — they are occasionally legitimate, and the prompt interrupt itself tells you the model has lost its anchor (see [[grounding-with-agents-md]]).
- Tighten further per repo: `"git push *": "deny"` for repos the agent should never publish.

Shippable copy: `projects/opencode-configs/opencode.hardened.json`.

## Correction, 2026-09-22: the jail, the fence and the sandbox are three different things

Measured across three harnesses on 2026-09-22 ([[harnesses-are-a-variable]]):

- **OpenCode** — `external_directory` jails the path-taking tools and **not** `bash` ([[opencode-tool-surface]]). The bash pattern fence on this page is the only thing covering shell traffic, and it is a denylist: it stops the commands you thought of.
- **DeepSeek Harness** — its bwrap sandbox in `workspace-write` mode confines `bash` **structurally**: the shell cannot reach outside the workspace regardless of the command. That is a stronger guarantee than any pattern list. Side effect observed: it also broke `ssh`, which is the intended outcome here but worth knowing if a task legitimately needs the network.
- **Pi** — no fence at all without an extension. A `tool_call` hook can implement one; see the Pi extension in progress at `projects/pi-extension/`.

A pattern fence and a sandbox are not interchangeable. Where a harness offers a real sandbox, prefer it; where it offers only patterns, the patterns on this page are the floor, not the ceiling.
