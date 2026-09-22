The tool surface OpenCode actually gives a model, and the extension points for changing it.
Verified 2026-08-23 against OpenCode **1.18.19** by reading the shipped binary and by driving a
live server with a recording endpoint that captured the exact request sent to the model.

Everything below is a measurement, not a reading of the documentation.

## Two guardrails already ship — and one of them did not save us

The default permission ruleset for the `build` agent is, verbatim from the binary:

```
"*": "allow",
doom_loop: "ask",
external_directory: { "*": "ask", <worktree>/*: "allow", /tmp/*: "allow" },
question: "deny", plan_enter: "deny", plan_exit: "deny",
read: { "*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow" }
```

- **`external_directory`** confines path-taking tools to the project directory.
- **`doom_loop`** stops the same tool call with identical input repeating.

Those are two of the four behaviours designed for the exoskeleton MCP server
([[exoskeleton-mcp-design]]): the repo jail and repeat detection. They already exist, on by
default, and were on during the incident in [[case-study-the-vault-hunt]].

**So why did the jail not stop the vault hunt?** Because `external_directory` governs the
path-taking tools — `read`, `edit`, `glob`, `grep` — and **not `bash`**. The hunt was
`find /home/jamiedean -path "*/mind-vault*"`, a shell command, and a shell command reaches
wherever the shell can reach. This is the single most useful fact on this page: the built-in
jail and the bash fence cover different halves of the same risk, and only the fence covers the
half that actually failed. Fencing the shell ([[fencing-the-shell]]) was not redundant with the
built-in protection; it was the only thing covering that path.

Permission values are `allow`, `ask`, `deny`. Keys: `read edit glob grep list bash task skill
lsp webfetch websearch todowrite question external_directory doom_loop`.

⚠️ **Do not write `external_directory` into config as a bare string.** Its default is a record;
the string form expands to `{"*": <value>}`, which risks discarding the worktree allowance and
prompting on every ordinary read. Leave it alone unless you are writing the full record.

## The tools a model is actually offered

Captured from the live request, not from the docs:

```
bash  edit  glob  grep  question  read  skill  task  todowrite  webfetch  write
```

Note what is **not** there: `list`, `patch`, `websearch`, and — even with `"lsp": true` set —
`lsp`. `lsp: true` feeds diagnostics into the loop; in this build it did not put an `lsp` tool
in the model's hands. A tool inventory that promises `lsp` or `websearch` is describing a
session the model is not in, and a small model has no way to detect the discrepancy. Measure the
offered set before writing it down.

## Extension points

| Thing | Path |
|---|---|
| Project commands | `.opencode/command/<name>.md` or `.opencode/commands/<name>.md` |
| Global commands | `~/.config/opencode/command(s)/<name>.md` |
| Project agents | `.opencode/agent(s)/<name>.md` |
| Global agents | `~/.config/opencode/agent(s)/<name>.md` |
| Project skills | `.opencode/skill(s)/<name>/SKILL.md` |
| Global skills | `~/.config/opencode/skill(s)/<name>/SKILL.md` |
| External skills, auto-loaded | `~/.claude/skills/<name>/SKILL.md`, `~/.agents/skills/<name>/SKILL.md` |
| Plugins | `.opencode/plugin(s)/<name>.ts` |

Both singular and plural directory names are accepted for commands, agents and skills.

There is a **built-in `/init`** whose description is "guided AGENTS.md setup", backed by a
`session.init` route: "Analyze the current application and create an AGENTS.md file with
project-specific agent configurations." It is a generic codebase-analysis prompt. It says
nothing about what tools the model has, which is the thing a small model most needs told.

## ⚠️ Backtick shell injection does NOT work in command templates

OpenCode's own tips say *"Use backticks to inject shell output (e.g. `git status`)"*. That is
true of a typed message. It is **not** true of a `.md` command template.

Measured: a command template containing `` `pwd` `` and `` `cat some/file` `` reached the model
with the backticks **unexpanded** — the model received the literal shell text as prose. Nothing
errors. Nothing warns. The command appears to work and quietly delivers a prompt full of
uninterpreted shell.

This matters more for a small model than a large one. A large model recognises the mess and
compensates. A 1.125 bpw model treats the literal text as the content and proceeds.

**The working pattern instead:** put the gathering in a script, and have the command instruct
one fixed `bash` call with no arguments to get wrong. The facts still arrive without the model
doing any exploration — which is the point — but through a tool call that genuinely executes.

## `instructions` works, and is the cheapest grounding lever

```json
{ "instructions": ["/abs/path/to/tool-inventory.md"] }
```

Schema: `string[]`, "Additional instruction files or patterns to include". Measured: the file's
contents arrive in the **system prompt** of every session in every project. For a small model
this is the highest-leverage line of config available — a tool inventory and a referent rule
present before the first turn, with nothing to invoke and nothing to remember.

Related config: `{env:VAR}` interpolates environment variables into config values, and
`{file:path}` inlines file contents. ⚠️ `{env:VAR}` on an **unset** variable interpolates to the
empty string rather than failing — an `Authorization: Bearer {env:TOKEN}` header silently
becomes `Bearer `, which surfaces later as a 401 from the server rather than as a config error.

## Wiring MCP servers

```json
{
  "mcp": {
    "some-remote": { "type": "remote", "url": "https://HOST:PORT/mcp", "enabled": true,
                     "headers": { "Authorization": "Bearer {env:SOME_TOKEN}" } },
    "some-local":  { "type": "local", "command": ["<runtime>", "<entrypoint>"], "enabled": true }
  }
}
```

Two practical notes:

- A **global** `mcp` block applies to every project. Prefer it to a committed project config,
  which publishes whatever hostname is in the URL — the token can be interpolated out of a repo,
  the hostname in the URL cannot.
- An **unreachable** MCP server fails at **startup**, not mid-session. That reads as "the editor
  is broken" rather than "a tool is down", and sends people hunting in the wrong place. Ship
  entries for not-yet-deployed servers with `"enabled": false` and flip them when they are live.

## What this changes

[[exoskeleton-mcp-design]] should build the two behaviours that are genuinely missing — the
anchored fuzzy edit and the path resolver — and drop the repo jail and repeat detection, which
the harness already provides. The measurement in [[roadmap]] P4 gets more honest as a result:
comparing against stock tools means comparing against stock tools *that already include a jail
and a loop-breaker*, and an earlier comparison would have credited the exoskeleton with two
wins the harness was already delivering.

## Corrections, 2026-09-21 and 2026-09-22

- ⚠️ **`doom_loop` did not catch a bash loop on 1.18.31.** Four byte-identical `podman ps` / `podman logs` calls ran unimpeded on 2026-09-21 (recorded in [[roadmap]] P2). Either the default changed after 1.18.19 or it does not catch this shape. "What this changes" above dropped repeat detection from the exoskeleton on the strength of `doom_loop`; that half of the scope cut needs re-testing on every OpenCode version, and loops happen in `bash`, which an MCP server cannot wrap.
- **Repeat detection is native elsewhere.** DeepSeek Harness 0.1.5-rc.3 ships `repeat-tool-reminder` at harness level, and it covers `bash`. Pi 0.87.0 has no built-in equivalent but exposes a `tool_call` extension hook where one can be written (in progress at `projects/pi-extension/`). See [[harnesses-are-a-variable]].
- **The jail is harness-specific.** DeepSeek Harness's bwrap sandbox confines `bash` structurally, which `external_directory` does not. See [[fencing-the-shell]].
- **The request is large.** Measured 2026-09-22: OpenCode's first request with 25 MCP tools and the tool inventory in `instructions` was **22.3k tokens across 37 tools**. Pi's was 2.5k across 4. On the same task and model, the two scored within 0.2 of each other out of 15 (n=3–4), so the extra surface neither helped nor measurably hurt — but it is context a small model does not get back.
- **OpenCode sent no `reasoning_effort`** in any captured request on 2026-09-22. If a model's reasoning budget matters, set it on the server side or cap output instead.
