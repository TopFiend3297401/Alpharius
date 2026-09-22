---
name: brief-small-models
description: Use when writing a task prompt or brief for a very small local coding model (roughly 1-4 bpw quantised, 30B class or below) driving an agent harness such as OpenCode - or when such a model ignores instructions, stalls on questions it cannot ask, or loops without finishing. Produces briefs with numbered steps, absolute paths, pre-answered decisions, an executable oracle, and an explicit stop condition.
license: MIT
---

# Write task briefs small models can actually execute

A small model executes structure far more reliably than it interprets prose. The brief does the
thinking; the model does the loop.

## Rules

1. **One milestone per brief.** Never "build the project" — the smallest separately verifiable
   piece, with everything else deferred to a future brief.
2. **A reading list of one.** Name exactly one file the model must read, by absolute path, and
   say "it is the complete spec for this task; do not read the rest". Every extra document is
   context spent and a chance to wander.
3. **Pre-answer every decision.** Language, file locations, dependencies (usually "standard
   library only"), naming, error behaviour. A small model cannot ask clarifying questions
   productively; an unanswered decision becomes an invented one.
4. **Numbered steps, imperative voice, exact paths.** "Step 2. Create `harness/generate.py`" —
   not "you could then add a generator".
5. **Give checkable numbers.** "All 29 fields", "17 of 21 checks pass" — the model can verify a
   count; it cannot verify "handle everything correctly".
6. **An executable oracle.** One command that decides success, stated verbatim, with its
   expected result: "run `python3 test.py`; fix until it exits 0". Never "make sure it works".
7. **An explicit stop condition with a report format.** "When all checks pass, stop and describe
   each fix in one sentence." Without it, finishing looks identical to looping.
8. **State what must not be touched.** Tests, specs, generated directories — by path. Small
   models love fixing the test.
9. **Hint generously on trivia.** If the task needs a language fact (say, that
   `isinstance(True, int)` is true in Python), put the fact in the brief. You are probing
   whether the model can hold a fix-list through an edit-test loop, not whether 4 GB of weights
   memorised the standard library.
10. **Paste the brief, and restate every criterion as an observable output.** Measured
    2026-09-22 on one task and model: told to read `BRIEF.md`, mean 12.5/15; `BRIEF.md` pasted
    verbatim, 13.2; a condensed paste with each acceptance criterion restated as something a
    command prints, 15 (n=1). Not "the binary reports alerts" but "running the binary prints
    `N alert(s):` with N ≥ 1". A property can be argued about; an output can be checked. Keep
    the file on disk too — a pasted brief does not survive compaction.
11. **Do not take the model's word for done.** In the same measurement, every run that failed a
    criterion (6 of 6) still reported it as passed, several after diagnosing the cause and
    arguing it away. The oracle in rule 6 must be run by you or the harness, not only by the
    model — and kept where the model cannot read it.
12. **Give a thinking model output room.** An 8192-token output cap was consumed entirely by
    reasoning on one run (`finish=length`) and the session ended with no final message. Set the
    output cap to at least 16k, or constrain the reasoning budget — and check the captured
    request, because not every harness sends a configured `reasoning_effort`.

## Harness notes

The rules are harness-agnostic. The mechanics differ: OpenCode reads `AGENTS.md` and can inject
a file into every system prompt via `instructions`; Pi and DeepSeek Harness do the equivalent
through extensions and plugins. See `vault/docs/harnesses-are-a-variable.md` in the Alpharius
repository.

## Watch the run, not just the result

The failure modes worth logging while it runs: edits whose anchor text no longer matches the
file (editing from memory), the same call repeated three or more times (pre-loop), tool calls
described in prose but never emitted, touched files outside the stated scope, failure to stop on
green, and a final report claiming a criterion the oracle says failed (self-certified completion
— the one that reaches the human). Each maps to a different fix in the brief or the harness, not
to "the model is bad".
