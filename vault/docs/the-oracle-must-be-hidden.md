# The oracle must be hidden, not absent

**Measured 2026-09-20.** Three runs of one task, one local model (a 35B-A3B MoE at ~120 tok/s,
131k context), same hardware. The only variable was the files in the repository.

## The three runs

| | grounding | fence + LSP | oracle | ambition stated | outcome |
|---|---|---|---|---|---|
| **v1** | a `CLAUDE.md` only | ❌ | ❌ none | ❌ | **2 human rounds.** Shipped a one-word `NameError`; reported *"the full stack is running and healthy"* while **26 of 30** endpoint pairs returned HTTP 500 |
| **v2** | none | ✅ | ✅ **in the repo** | ❌ | **0 human rounds**, claim independently true — but **12× less frontend** (207 lines vs 2,513) |
| **v3** | `AGENTS.md` | ✅ | ✅ **hidden** | ✅ | per-field provenance, its own test suite, correct modelling of unbuilt hardware |

## The finding

An oracle the model can read **becomes the specification**.

In v2 the model read `verify.sh` before starting, counted its five assertions, and built exactly
those and nothing more. That is not misbehaviour — it is the rational response to being told *"done
means this script exits 0"*. **A verifier written for correctness silently became a ceiling on
ambition.**

But removing the oracle is not the answer either. v1 had no oracle and declared success from a
health endpoint while the feature was comprehensively broken.

**Both problems have the same solution: keep the oracle, move it out of reach.**

> **The loop holds the oracle. The model never sees it.**
> State the standard in prose. Grade with a command the model cannot read.

## Why this matters beyond one benchmark

Any unattended or delegated agent loop needs a machine-checkable definition of done — otherwise
"finished" is the model's opinion, and v1 shows what that opinion is worth. So the oracle is not
optional infrastructure.

Placing it in the repository is the intuitive move and it is the wrong one. The correct shape is:

1. **Ambition** lives in the brief, in prose, where it can inspire scope.
2. **Correctness** lives in a script outside the repository, where it can only gate.
3. The model is told the *standard* ("bring the stack up, exercise every entry point, check response
   bodies, read the logs, write your own tests") but never the *assertions*.

## Corollaries, all measured

- ⛔ **A startup check is not a functional check.** `/health` returning 200 proves the process is up
  and nothing else. Assert on response bodies.
- ⛔ **"Verify A and B" means checking both.** One run's own task list said *"backend starts and
  frontend builds"*; `node_modules` was absent. The first half ran, the second was asserted.
- ⚠️ **A false failure is worse than a missed one.** An oracle that reports a working system broken —
  because it used an invocation the project never documented — poisons the comparison it exists to
  make. Check your own command against the project's documentation before recording a failure.
- ⚠️ **Do not encode ambition in the oracle to compensate.** Adding "and it must have animations" as
  an assertion just moves the ceiling; it does not remove it. Ambition belongs in prose.

## See also

`failure-taxonomy.md` · `grounding-with-agents-md.md` · `fencing-the-shell.md` ·
the `opencode-init` skill, which implements all of this as a procedure.
