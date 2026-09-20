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

## Step 2 — `opencode.json` (repo root) · FIXED, copy verbatim

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

Paste this to the model **verbatim** when the session starts. Keeping it in a file is what makes
runs comparable.

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

⚠️ **A false failure is worse than a missed one.** Before reporting a failure, check your own
invocation against what the project documents. In one run an oracle reported "the backend does not
start" because it used `--app-dir src` where the project documented `src.main:app`.

---

## Step 5 — run it

```bash
cd <repo>
opencode --model <provider>/<model>
```

Then paste `BRIEF.md` verbatim. In a second terminal, watch real throughput — never trust a model's
claim about its own speed.

---

## What is FIXED and what is DYNAMIC

**Fixed — these carry between every project:**

- The four files exist **before** the first session
- The boundary lines in `AGENTS.md` (only this repo · no ssh/scp/rsync · named siblings forbidden)
- The `opencode.json` fence, verbatim, plus `lsp: true`
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
- ⚠️ **Sibling directories are magnets.** If earlier attempts at the same task sit next door, the
  model will read them unless told not to — measured, and caught by the native repo jail.

---

## Related

`harden-opencode` (Alpharius) is the ancestor of this skill and covers Steps 1–2 plus a wander
probe. This skill supersedes it by adding: the hidden oracle, the ambition statement, MCP-sourced
facts with provenance, and the end-to-end definition of done.
