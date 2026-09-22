# dsh-oracle-gate

A DeepSeek Harness (dsh) plugin that makes `/goal` completion depend on a hidden oracle rather
than on the model's own opinion. Alpharius delivery-plan item 3.2; doctrine in
`vault/docs/the-oracle-must-be-hidden.md`.

## The problem

In dsh, a goal completes when the model calls `update_goal` with `action: "complete"`. Nothing
checks the claim. Measured 2026-09-22: Occamy-1.0 completed its goal on round 1 with two false
claims while the task's hidden oracle scored 11/15. dsh's own round-driver README lists
"evaluator-backed round certification" as deferred work.

## What it does

When the model calls `update_goal` with `action: "complete"`, the plugin runs the configured
oracle command in the session's working directory (`session.header.cwd`).

- Exit 0: the call goes through unchanged and the goal completes.
- Any other exit: the call is denied before the tool body runs. The model receives an error that
  says the goal is NOT complete and remains active, followed by only the oracle's `FAIL` lines,
  truncated to `maxFeedbackChars`. The goal stays `active`, so `dsh-goal-round-driver` schedules
  the next round, up to the goal's own `maxGoalRounds` (at which point the driver records the
  `round-limit` blocker as usual).
- Timeout: denied with a timeout message; the oracle's whole process group is killed.
- Oracle missing or not executable: denied (fails closed) without naming it.
- Call cancelled while the oracle runs: denied, never allowed (see "Version notes").

The oracle's command, path, directory and file name are redacted from anything the model sees,
including `FAIL` lines that print them. The real outcome (exit code, timeout, spawn error) is
logged host-side through `ctx.logger` only.

## Seam: `tools/pre-execute`, and why

Every tool call passes through the `tools/pre-execute` waterfall in `@deepseek-ai/dsh-tools`
before its body runs (`packages/core/tools/src/index.ts`: declaration at line 153; the waterfall
and the deny path at lines 1503-1528 — a `deny` decision becomes an `Error: <reason>` result and
the call is never dispatched). The completion itself, and the `<goal_complete>` wrap-up context
that tells the model to write its closing message, both happen inside the `update_goal` body
(`packages/goal/tool-goal/src/index.ts` lines 321-338). Denying before dispatch therefore
prevents both; nothing has to be undone.

Rejected alternatives:

- `ctx.tools.guard()` — the right shape (monotonic, deny-only) but synchronous
  (`ToolGuard = (execution) => string | undefined`, same file line 723), so it cannot await an
  oracle that takes minutes.
- `tools/post-execute` block — runs after the body, so the goal is already `complete`.
- Listening to `goal/change` and reopening — after the fact, `complete` is terminal in the goal
  domain (no model-reachable reopen), and the wrap-up prompt has already been queued.

The listener calls `next()` first, so a call that earlier policy already denied does not spend an
oracle run. Other `update_goal` actions (`blocked`, `pause`, `edit`, `resume`) and other tools
are not touched.

## Configuration

| key | default | meaning |
|---|---|---|
| `command` | required | argv array, run with the session cwd; no shell unless you invoke one |
| `timeoutMs` | 600000 | kill and refuse after this long |
| `maxFeedbackChars` | 2000 | bound on the failing-check text returned to the model |
| `revealOutput` | false | return the whole (redacted, truncated) output instead of only `FAIL` lines |
| `feedbackPattern` | `^\s*FAIL\b` | which output lines count as failing checks |

Keep the oracle outside the workspace, somewhere the model's tools cannot read. Redaction hides
where it lives; it cannot hide a file the model can simply open.

## Mounting

Local plugin rows need an absolute path to `index.js` (dsh resolves module paths from the
profile directory, not from the patch file). Add this to
`$DSH_HOME/profiles/<profile>/cordis.patch.yml`, or pass it with `--patch`:

```yaml
- insert:
    - id: goal-oracle-gate
      name: /mnt/ORICO-1TB/Code-Projects/projects-personal/Alpharius/projects/dsh-oracle-gate/index.js
      config:
        command: ['/path/outside/the/workspace/grade.sh']
        timeoutMs: 600000
        maxFeedbackChars: 2000
        revealOutput: false
```

The profile must also mount `dsh-goal`, `dsh-tool-goal` and `dsh-goal-round-driver` (the shipped
`headless` and `web` profiles already do). The directory is also a dsh bundle
(`package.json` declares `dsh.bundle`), installable with `dsh plugin --profile <name> add
<this dir>`; its own row defaults `command` to `['false']` (refuse everything) and must be
overridden by id in the profile patch.

## Tests

```sh
node --test test/gate.test.js
```

13 tests, no dependencies, no network: pass allows; fail refuses with `FAIL` lines only; timeout
refuses and kills; no path, directory or file name leaks (also with `revealOutput`); a missing
oracle fails closed; truncation; session cwd; non-completion calls are untouched; an earlier deny
is preserved; cancellation fails closed; config validation. Two deliberate mutations (disabling
redaction, allowing on failure) each turn tests red.

Load proof without a model (2026-09-22, dsh 0.1.5-rc.3): booting `dsh --profile web --no-open`
under a throwaway `DSH_HOME` with this row plus a probe plugin that calls
`ctx.tools.execute({ name: 'update_goal', arguments: { action: 'complete', ... } })` through the
real registry returned the refusal text with the `FAIL` line redacted to `<oracle>`; with a
passing oracle the call went through to dispatch. An invalid config fails the boot with
`invalid config`. `--dump-config` shows the row composed. Not yet run end to end with a model.

## Version notes

Written against the source clone (0.1.7-alpha.2) and verified on the installed 0.1.5-rc.3.
In rc.3 `PreToolDecision` has no `cancel` kind: an unrecognised decision without a `reason` is
treated as allow. The plugin therefore answers a cancelled call with `deny`, never `cancel`.
rc.3 also ignores `deny.info`; the model-facing text is unaffected.
