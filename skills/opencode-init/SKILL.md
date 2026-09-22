---
name: opencode-init
license: MIT
description: Use when setting up OpenCode in a repository that a small or local model will drive, or appending OpenCode to an existing project. Writes the four files that must exist before the first session — AGENTS.md, opencode.json, BRIEF.md and a hidden oracle — so the model stays in its directory, uses MCP for real facts, states provenance honestly, and proves its own work end to end instead of claiming success from a health check.
---

# Initialise OpenCode for a local model

Derived from three measured runs of the same task on the same local model (2026-09-20). The
difference between the runs was **entirely** in these files. Same model, same hardware:

| | grounding | fence+LSP | oracle | ambition | result |
|---|---|---|---|---|---|
| v1 | `CLAUDE.md` only | ❌ | ❌ | ❌ | 2 human rounds; shipped a one-word `NameError` and called it "running and healthy" while 26/30 endpoints returned 500 |
| v2 | none | ✅ | **in repo** | ❌ | **0 human rounds** — but built **12× less frontend**, because it read the oracle and built only what it asserted |
| v3 | `AGENTS.md` | ✅ | **hidden** | ✅ stated | per-field provenance, own pytest suite, correct "planned" modelling of unbuilt hardware |

**The lesson in one line: the loop holds the oracle; the model never sees it.**

> **Harness scope.** Steps 1, 3 and 4 are harness-agnostic. Steps 2 and 5 are OpenCode-specific:
> on DeepSeek Harness, use its bwrap sandbox (`workspace-write`) as the fence — it confines bash
> structurally — and its native `repeat-tool-reminder` for loops; on Pi, fencing and repeat
> detection need a `tool_call` extension. Measured comparison:
> `vault/docs/harnesses-are-a-variable.md` in the Alpharius repository.

---

## Which mode

- **init** — a new/empty repo. Write all four files, then hand over the brief.
- **append** — an existing project. Write `AGENTS.md` and `opencode.json` only; the brief becomes
  whatever task is at hand. ⚠️ **Never overwrite an existing `AGENTS.md`** — read it, and add only
  the missing boundary lines.

---

## Step 1 — `AGENTS.md` (repo root) · FIXED SHAPE, dynamic nouns

OpenCode reads this natively. It must exist **before the first session**, not after. A model's first
session in an ungrounded repo goes wandering.

```markdown
# Agent ground rules for <PROJECT>

- This repository lives at `<ABSOLUTE-PATH>`.
- **"<NOUN>"** means <PIN IT>. <State what it is NOT — especially if a word could be read as a
  directory when it is actually a service, an API or a remote thing.>
- **Work only inside this repository.** Never read, list or write outside this root.
  <If sibling directories exist, name them and say reading them is forbidden.>
- **Never use ssh, scp or rsync.** <Name any host the project discusses but must not connect to.>
- Build artefacts, venvs and `node_modules` belong inside this repository.
- Do not install system packages. `<project package manager>` inside the project is fine.
- <House style: language variant, formatting, anything it must not invent.>
```

⛔ **Keep it short.** Every line competes for a small model's attention.

⚠️ **The noun-pinning line is the one people skip and the one that pays.** In a measured run, a model
told to use "the vault" — a *service* reached over MCP — had to be told explicitly *"it is not a
directory"* or it would have gone hunting for `vault/`.

---

## Step 2 — `opencode.json` (repo root) · FIXED, copy verbatim · OpenCode-specific

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

- Rules are pattern-matched and **the last match wins**, so the wildcard goes first.
- Filesystem-wide sweeps are `ask`, not `deny` — **the interrupt itself is the signal** that the
  model has lost its anchor.
- ⚠️ `external_directory` (OpenCode's native repo jail) does **not** fence `bash`. This block is
  separate and still necessary.
- ⚠️ **`webfetch` permissions work** — verified on OpenCode 1.18.25/1.18.31. Older guidance claiming
  they break the config referred to 1.18.19.
- ⛔ **Config is read at session start.** Editing it mid-session changes nothing. **Restart.**

### If the project is Python, add `pyrightconfig.json`

LSP is worthless if its output is noise. Without this, every file reports unresolved imports, and a
model that learns to dismiss LSP output will dismiss the real error too.

```json
{ "typeCheckingMode": "basic", "extraPaths": [".venv/lib/python<VER>/site-packages"] }
```

---

## Step 3 — `BRIEF.md` · FIXED SKELETON, dynamic content

⛔ **`BRIEF.md` must be a FILE in the repository, not only a pasted message — and the model must be
told to re-read it before claiming done.**

A long session will compact. When it does, a *pasted* brief becomes a summary, and the first thing
lost is the numbered acceptance criteria — leaving the model with a vague sense of "finished"
instead of a contract. **Measured 2026-09-20:** a run compacted, then stopped four steps short of
its own "Done means" list and *asked permission* to do step 1, which the brief had already
required. Everything it had verified was real; it verified against the remembered gist.

**A file survives compaction. A message does not.** Paste it verbatim at the start *and* keep it on
disk.

⛔ **Paste it — do not only tell the model to read it — and write every "Done means" item as an
observable output.** Measured 2026-09-22 (one task, one model): "read `BRIEF.md`" scored a mean
12.5/15; pasting it verbatim 13.2; a condensed paste restating each criterion as something a
command prints scored 15 (n=1). Not "the binary reports alerts" but "running the binary prints
`N alert(s):` with N ≥ 1".

```markdown
# The brief

<CONCEPT — what the thing is, in two or three sentences.>

## Stack
- **<Layer>** — <language, framework, package manager>
- **<Layer>** — <…>
- **Containers** — <runtime, compose file> (if applicable)

## Data
<WHICH FACTS ARE REAL AND WHERE THEY LIVE. If real data exists behind MCP tools, say so:>
Use your MCP tools to look these up. **Do not invent them and do not guess from the name.**
<Table: thing → what it is → any trap, e.g. a misspelled identifier, or a thing that is PLANNED
rather than built.>

For each value, **record where it came from**. A field you read from a source and a field you
inferred must not look the same in the output.
⛔ **If a value is not in the source, mark it `estimated` and say so. Never label an inferred value
as sourced.**

<Say plainly which data MAY be mock.>

## Boundaries
- ⛔ **Stay inside this directory.** Do not read, list or explore anything outside this root.
- ⛔ **Never ssh, scp or rsync.** <Named hosts> are things you look up, not machines you connect to.
- Do not install system packages.

## <Ambition — ONLY if you want more than correctness>
**Make it genuinely good.** <Name the specific qualities: motion, visual explanation, comparison
views, typography.> This is a showcase piece, not a form.

## Done means
**You run a real end-to-end test and it passes.** Not "it started" — *the feature works*:
1. Bring the whole stack up <under the real runtime>.
2. Exercise **every** <endpoint/entry point> with real values and check the **response bodies**,
   not just status codes.
3. **Read the logs** of every service and confirm no errors hide behind a healthy status.
4. Confirm <the user-facing part> actually works against <the backend>.
5. Write your own tests and run them.

⚠️ A startup check is not a functional check. A previous run reported "the full stack is running and
healthy" while **26 of 30** endpoint pairs returned HTTP 500, because it checked `/health` instead
of the feature. Do not repeat that.

⛔ **If a command returns the same result twice, stop checking and change the state.** A check that
says "absent" is telling you to CREATE the thing, not to look again. Verifying a precondition is not
establishing it.

⛔ **Before you say you are done, re-read `BRIEF.md` and confirm every numbered step above.** Do not
ask permission for anything this brief already requires — it is already authorised.

State plainly what you verified and how. If something does not work, say so rather than rounding up.
```

---

## Step 4 — the oracle · ⛔ NEVER IN THE REPO

Write a verification script that decides pass/fail **without a human reading code**, and keep it
**outside the repository** — `/tmp`, or your own working directory.

**Why it must be hidden.** In the v2 run the oracle sat in the repo. The model read it, counted its
assertions, and built exactly those — 207 lines of frontend against 2,513 in the unconstrained run.
**A verifier for correctness became a ceiling on ambition.**

So: state the standard in prose (Step 3), grade with a command the model cannot read.

It should check, at minimum:
1. **Static analysis clean** (`pyright`, `tsc`, `clippy` — whatever the language offers)
2. **The service starts**
3. ⛔ **Every meaningful input combination returns a usable result** — assert on the **body**, not
   the status code
4. **The client half builds** — and that its dependencies were actually installed
5. Exit non-zero on any failure

⛔ **The oracle must clean up after itself.** Anything it starts, it kills — and it should verify the
kill, not assume it. **Measured 2026-09-20:** an oracle's PID capture happened inside a subshell, so
its server outlived the run by half an hour. A later session found that stranger's process, assumed
it was its own, and reported on it. **A leftover process is a false witness for every run after it.**

⚠️ **A false failure is worse than a missed one.** Before reporting a failure, check your own
invocation against what the project documents. In one run an oracle reported "the backend does not
start" because it used `--app-dir src` where the project documented `src.main:app`.

---

## Step 5 — run it · OpenCode-specific

```bash
cd <repo>
opencode --model <provider>/<model>
```

Then paste `BRIEF.md` verbatim. In a second terminal, watch real throughput — never trust a model's
claim about its own speed.

⚠️ **Give a thinking model output room.** Measured 2026-09-22: an 8192-token output cap was consumed
entirely by reasoning (`finish=length`) and `opencode run` exited with no final message. Set the
output cap to at least 16k, or constrain the reasoning budget. OpenCode sent no `reasoning_effort`
in the captured requests, so the cap is the lever that works.

⛔ **Grade with the oracle, not the final message.** Every run that failed a criterion in that
measurement (6 of 6) reported it as passed. The model's account of done is not evidence.

⚠️ **Confirm LSP actually started** in `opencode.log`. `"lsp": true` was inert for Rust with no
`rust-analyzer` installed, and nothing said so.

---

## What is FIXED and what is DYNAMIC

**Fixed — these carry between every project:**

- The four files exist **before** the first session
- The boundary lines in `AGENTS.md` (only this repo · no ssh/scp/rsync · named siblings forbidden)
- The `opencode.json` fence, verbatim, plus `lsp: true` (OpenCode; the requirement — bash cannot
  leave the repo — carries to other harnesses)
- The brief is pasted, and every criterion is an observable output
- Output cap ≥ 16k for a thinking model
- **The oracle is outside the repo**
- Ambition stated in prose, never encoded in the oracle
- "Done" = stack up · every input · check bodies · read logs · own tests
- The "startup check is not a functional check" warning
- Per-field provenance, and never labelling inferred values as sourced
- Restart after any config change

**Dynamic — fill these in per project:**

- Concept, languages, frameworks, package managers
- The load-bearing nouns to pin
- Which MCP sources hold real facts, and which facts are permitted to be mock
- What "every entry point" means for this system
- The specific ambition
- The oracle's actual assertions

---

## Traps worth carrying

- ⛔ **The oracle becomes the spec if the model can read it.** Hide it.
- ⛔ **A startup/health check proves the process is up and nothing else.** Assert on bodies.
- ⛔ **"Verify A and B" means checking both.** One run claimed "backend starts and frontend builds"
  with `node_modules` absent — the second half was asserted, not performed.
- ⛔ **Retrieval is not reading.** A model that searches a knowledge base may extract only the field
  it queried and confabulate the neighbours **from the same document it already has open**. Ask for
  the fields you need by name.
- ⛔ **Provenance can lie.** A model given a `source` field will happily tag an invented value as
  sourced. State the rule explicitly: no source, mark it estimated.
- ⚠️ **Noisy LSP trains the model to ignore LSP.** Fix the language-server config before the run.
- ⛔ **A check that returns the same answer twice is not a plan.** Small models will re-run a
  failing state check instead of changing the state. **Measured 2026-09-21:** four byte-identical
  `podman ps` / `podman logs` calls against containers that did not exist, each preceded by the same
  sentence. ⚠️ **OpenCode's native `doom_loop` did not catch it**, and the exoskeleton's
  `RepeatDetector` cannot — it guards `find_file`/`read_file`/`edit_file`, and loops happen in
  `bash`. State the rule in the brief instead.
- ⛔ **Compaction eats acceptance criteria.** Keep the brief on disk and make re-reading it the last
  step before "done". A model that compacted will otherwise finish against a summary of its contract.
- ⛔ **A model will ask permission for work it was already given.** State explicitly that the brief
  is authorisation. Otherwise a compacted session stalls politely at step 1.
- ⛔ **Self-certified completion.** The model will report a failed criterion as passed, sometimes
  after diagnosing why it failed. Measured 2026-09-22: 6 of 6 failing runs did so. Only the hidden
  oracle decides done.
- ⚠️ **Sibling directories are magnets.** If earlier attempts at the same task sit next door, the
  model will read them unless told not to — measured, and caught by the native repo jail.

---

## Related

`harden-opencode` (Alpharius) is the ancestor of this skill and covers Steps 1–2 plus a wander
probe. This skill supersedes it by adding: the hidden oracle, the ambition statement, MCP-sourced
facts with provenance, and the end-to-end definition of done.
