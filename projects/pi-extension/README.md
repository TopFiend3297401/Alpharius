# Alpharius for Pi

The exoskeleton (`../exoskeleton-mcp/`) ported to a Pi extension (Pi 0.87.0). It covers the
failure categories in `vault/docs/failure-taxonomy.md` without giving the model anything new
to read. **It registers no tool and does not touch the system prompt.** Every behaviour runs
in `tool_call` (block, or patch the input) or `tool_result` (append text), so it costs
**0 prompt tokens**. `smoke.sh` checks this by comparing the system prompt and every tool
schema with the extension loaded and without it; the two are byte-identical. Text reaches the
model only when a guard fires.

| Feature | Hook | Kills | Off switch |
|---|---|---|---|
| **Fence**: `ssh`/`scp`/`rsync`, `find /`, `find /home`, and any bash word that resolves outside the repo (`..`, `/abs`, `~`, `$HOME`, `--opt=/x`, `VAR=/x`, redirect targets, symlinks, a literal `cd` followed) | `tool_call` | wander ([[case-study-the-vault-hunt]]) | `ALPHARIUS_FENCE=0` |
| **Repo jail**: `path` for read/write/edit (and grep/find/ls if enabled) is resolved through `@`, `~`, `..` and symlinks, including a symlinked parent of a file that does not exist yet | `tool_call` | wander | `ALPHARIUS_JAIL=0` |
| **Repeat guard**: *"same call three times — change approach or finish"*, bash included | `tool_call` | dead loops | `ALPHARIUS_REPEAT=0` |
| **Anchored edit rescue**: (a) an anchor Pi can't find that matches exactly one line window with whitespace ignored is rewritten to the file's real text before Pi runs; (b) on Pi's `Could not find…` the result gets the exoskeleton's *nearest actual text* | `tool_call` + `tool_result` | stale edits | `ALPHARIUS_EDIT_RESCUE=0` |
| **Bash default timeout**: a `bash` call sent without `timeout` gets one (120 s). Pi's bash tool has *no default timeout*; on 2026-09-23 a model twice ran a deadlocking binary bare and the whole run hung until killed. The model's own value is kept | `tool_call` (input patch) | hung runs | `ALPHARIUS_BASH_TIMEOUT=0` (or a number of seconds) |
| **Phantom path hint**: on a read/edit `ENOENT`, up to 3 fuzzy candidates from the repo (`find_file` scoring) | `tool_result` | phantom paths | `ALPHARIUS_PATH_HINT=0` |

`ALPHARIUS=0` switches everything off. Other settings: `ALPHARIUS_ROOT` (default: the cwd Pi
started in, fixed at first use), `ALPHARIUS_REPEAT_THRESHOLD` (3), `ALPHARIUS_REPEAT_WINDOW`
(10), `ALPHARIUS_ALLOW_PATHS` (colon-separated paths outside the repo that bash may name; `/dev/null`
and the other `/dev` streams are always allowed). To use the extension as a library,
`createAlpharius(config)` in `lib/alpharius.ts` takes the same settings as an object.
`/alpharius` shows the current state. It is a user-side command, so it is never sent to the model.

**Repeat rule.** A call is blocked when the same tool with the same canonical arguments
appears for the 3rd time within the last 10 calls. Canonical means object keys are sorted.
For bash, only the command counts: whitespace is collapsed and `timeout` is ignored. A
**successful write/edit clears the history**, because running `pytest` again after a fix is
progress, not a loop. Blocked calls stay in the history, so a model that keeps retrying stays
blocked. The exoskeleton counted forever. That is fine for a short MCP server, but over a long
Pi session it would block legitimate re-runs.

## Enable

```bash
pi -e /mnt/ORICO-1TB/Code-Projects/projects-personal/Alpharius/projects/pi-extension/index.ts
```

To enable it permanently, add the directory to `"extensions"` in the agent dir's `settings.json`.
For the harness trials that is `~/.local/share/harness-trials/pi-agent/settings.json`:
`"extensions": ["/mnt/ORICO-1TB/Code-Projects/projects-personal/Alpharius/projects/pi-extension"]`.
Its `extensions/fence.ts` is a subset of this extension's fence. Keeping both is harmless, but
remove fence.ts if you want one source of the block message.

## Test

```bash
npm test      # node --test, 56 tests, no deps (Node >= 22.18 strips types natively)
./smoke.sh    # real Pi, --offline, throwaway config dir, scripted fake model
```

The unit tests port the exoskeleton cases for the jail, the resolver, the fuzzy edit and repeat
detection. The expected numbers come from running the Python originals, and difflib `ratio()` is
checked against CPython. `hooks.test.ts` also runs the hooks against **Pi's real `read`/`edit`
implementations** in the agent loop's order. `smoke.sh` then drives the real agent loop with
`test/e2e/scripted-provider.ts`, an in-process provider that replays tool calls. No network and
no GPU are used.

## Not ported, and why

- **`find_file` as a tool.** A new tool schema costs tokens on every request. The phantom-path
  hint gives the same ranking at the moment it is needed.
- **State-echo footer** ("Project root: … (N files)" on every result). It adds tokens to every
  tool result. Pi's system prompt already states the cwd.
- **Exoskeleton-only arguments** (`anchor`/`replacement`). Pi's `edit` schema is kept exactly
  as it is. Rescue (a) applies the fuzzy tier through input patching instead.
- **Fence limits.** The fence tokenizes the command; it does not execute it. Paths computed
  at runtime get through, for example `p=$(dirname $(pwd)); ls $p`, and so do paths inside
  program strings (`python3 -c "open('/etc/passwd')"`). Heredoc bodies are skipped on purpose.
  A `cd` inside a subshell is treated as if it were not in one, so `(cd lib); cat ../x` resolves
  `../x` from `lib`. False positives are possible, for example `grep '/api/' src`, where the
  pattern looks like an absolute path. If that bites, use `ALPHARIUS_ALLOW_PATHS` or turn the
  fence off. The repo jail on read/write/edit has none of these gaps, because those tools take
  a plain path.
- **Narrated calls.** No hook can fix these. As in the exoskeleton design, this is a prompting
  problem.
