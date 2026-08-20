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

## Watch the run, not just the result

The failure modes worth logging while it runs: edits whose anchor text no longer matches the
file (editing from memory), the same call repeated three or more times (pre-loop), tool calls
described in prose but never emitted, touched files outside the stated scope, and failure to
stop on green. Each maps to a different fix in the brief or the harness, not to "the model is
bad".
