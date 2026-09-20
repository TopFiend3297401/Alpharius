# The harness is now the bottleneck

**Observed 2026-09-20/21**, across four sessions of one local model (35B-A3B MoE, ~120 tok/s,
131k context) driving OpenCode on the same task.

## What changed

Alpharius was founded on the premise that small models fail at **tool mechanics** — stale edits,
wrong paths, hallucinated tools, narrated-but-never-emitted actions. That premise held for the
earlier generation, and the structure built around it works.

But across these four runs, the model cleared every mechanical bar:

- it terminated, every time
- it called tools instead of describing them
- it used **prefixed** MCP tool names first try
- it routed to a knowledge base unprompted rather than inventing facts
- it wrote and ran its own test suite
- it made a **one-character** fix when given a failure, without collateral damage
- it **repaired its own language-server config** after first dismissing a diagnostic as noise

The failures that remained were caused by the scaffolding:

| Failure | Cause | Whose |
|---|---|---|
| Built 12× less frontend than it could | The oracle sat in the repo and became the spec | **harness** |
| Shipped a one-word `NameError` | LSP was switched off | **harness** |
| Stopped four steps short of its own contract, and asked permission for step 1 | The brief was a *pasted message*; compaction reduced it to a gist | **harness** |
| Reported on a stranger's server process as its own | A previous oracle run left a process alive | **harness** |
| Labelled an invented value as sourced | Nothing in the brief forbade it | **harness** |
| Justified a correct action with a wrong complexity class | — | **model** |

**One model failure in the list.** Everything else was a file we did or did not write.

## Why that is the win, not the complaint

A model-capability ceiling is something you wait for someone else to raise. **A harness ceiling is
something you fix this afternoon.** Every row above has a one-line remedy, and all of them are now
in the `opencode-init` skill.

It also changes where effort should go. The instinct is to reach for a bigger model or a better
quantisation. The measured answer here is that the next increment of usable capability comes from:

1. Putting the oracle **out of reach** so it gates without capping.
2. Keeping the contract **on disk** so compaction cannot erode it.
3. Making the verification channel **clean** so its output stays trustworthy.
4. Saying explicitly that **the brief is authorisation**, so a compacted session does not stall
   politely at step one.

None of that requires a better model.

## The caveat worth keeping

This is four sessions on one task, not a benchmark. The single model-side failure — a confidently
wrong justification for a correct action — is the one class no harness catches, and it is precisely
the class that matters when nobody is watching. **Grade outcomes, never the model's account of
them.**

## See also

`the-oracle-must-be-hidden.md` · `failure-taxonomy.md` · the `opencode-init` skill.
