OpenCode permission configuration for running small models safely. Syntax verified against the OpenCode docs, 2026-08-20.

## Why

- Out of the box (or with a permissive config) every bash call can be auto-allowed. Observed live: a wandering model's `find /` across the whole filesystem sailed through with `action=allow pattern=*`.
- A small model will eventually emit a command you did not anticipate. The fence makes the blast radius a config decision instead of a hope.

## Syntax facts

- Actions: `"allow"`, `"ask"`, `"deny"`.
- Bash rules are pattern-matched and the **last matching rule wins** — so the `"*"` wildcard goes first, specific rules after it.
- `read`, `edit` and `webfetch` accept the same treatment, with path patterns for read/edit.

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
    "webfetch": {
      "*": "ask"
    }
  }
}
```

- Network escape (ssh/scp/rsync) is denied outright: a local agent has no business leaving the machine.
- Filesystem-wide sweeps are `ask`, not `deny` — they are occasionally legitimate, and the prompt interrupt itself tells you the model has lost its anchor (see [[grounding-with-agents-md]]).
- Tighten further per repo: `"git push *": "deny"` for repos the agent should never publish.

Shippable copy: `projects/opencode-configs/opencode.hardened.json`.
