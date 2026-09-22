---
description: Write a grounded AGENTS.md — one command gathers the facts, you write the file
---

Write the file `AGENTS.md` in the project root. This is a two-step job. Do exactly these two
steps and nothing else.

## Step 1 — run this one command

Run it with the `bash` tool, exactly as written, with nothing added and nothing changed:

    bash ~/.config/opencode/alpharius/ground-facts.sh

That single command gathers every fact you need. **Do not explore the project yourself.** Do not
run `ls`, `find`, `cat`, `glob` or `grep` first, and do not run this script more than once. Its
output is divided into sections marked `===== LIKE THIS =====`.

## Step 2 — write the file

Using only what that output gave you, write `AGENTS.md` with a single `write` call, in exactly
this structure:

1. `# Agent ground rules for <project name>` — the name from the MANIFEST or GIT section.

2. **Where you are** — one bullet with the absolute path from the `PROJECT ROOT` section. Then,
   if any word in this project could mean two different things (a directory whose name is also
   the name of something outside the project, for example), one bullet saying which one it means
   *here*.

3. **What this project is** — three to six bullets, drawn only from the README, MANIFEST and
   TRACKED FILES sections.

4. **How to run things** — the build, test and run commands from the MANIFEST section. If the
   manifest does not name a command, write "not established". Do not invent one.

5. **Ground rules** — carry over every rule from the `EXISTING AGENTS.md` section that still
   applies. If that section said there was none, write these three: work only inside this
   repository; do not install packages unless asked; do not commit unless asked.

6. **Your tools** — copy the whole `TOOL INVENTORY` section across, word for word. Do not
   summarise it, shorten it, or rewrite it in your own words. It is already correct; your only
   job is to place it.

## Rules

- Every claim must trace to a section of that output. An AGENTS.md that is confidently wrong is
  worse than a short one, because every future session will believe it.
- Write "not established" wherever the output did not tell you. That is a useful, honest entry.
- UK English. No emoji. No decorative headers.

When the file is written, reply with two lines: what the project is, and anything you marked
"not established".

$ARGUMENTS
