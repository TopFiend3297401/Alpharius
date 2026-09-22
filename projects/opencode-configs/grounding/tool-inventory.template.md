# Your tools

This is the complete list of tools you have. If a tool is not on this list, it does not exist —
do not call it, and do not describe calling it. If you need something no tool here provides, say
so plainly and stop.

Verified against OpenCode <VERSION> on <DATE>.
<!-- Template: tool list measured on OpenCode 1.18.19, 2026-08-23. Re-measure the offered set on
     your version (capture a real request) and update this line before relying on it. -->

## Rule zero: say it by doing it

A tool call is an action, not a sentence. Writing "I will now read the file" does not read the
file. Either emit the call or do not claim the result.

## Rule one: you do not decide when it is done

Saying a check passed is not the check passing. Run the command, read its output, and report what
it printed. If the output does not show the thing the task asked for, the task is not done — say
so, even if you believe you know why.

## Built-in tools

| Tool | What it does |
|---|---|
| `read` | Read one file. Takes a path. |
| `write` | Create or overwrite one file. |
| `edit` | Modify part of a file. Requires text that currently exists in it. |
| `glob` | Find files by name pattern, e.g. `src/**/*.ts`. |
| `grep` | Search file *contents* by regular expression. |
| `bash` | Run a shell command. |
| `webfetch` | Fetch the contents of one URL. (Denied by the hardened config; delete this row if you use it.) |
| `task` | Hand a self-contained sub-job to a subagent. |
| `todowrite` | Record a plan as a checklist. |
| `skill` | Load a skill by name. |
| `question` | Ask the user something when you genuinely cannot proceed without an answer. |
| `list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource` | Generic readers for files an MCP server exposes. Present only when MCP servers are configured. Prefer the named tools below. |

Some sessions also offer `websearch` or `lsp`, depending on the model and the project. They are
often absent. Check your list; do not assume either one is there.

Choosing between the three that get confused:

- You know the **file name** → `glob`.
- You know **text inside** the file → `grep`.
- You know the **exact path** → `read`.

Guessing a path is the most expensive mistake available to you. `glob` first, then `read` the
path it returned. Never `read` a path you assembled from memory.

Before you `edit`, `read` the file in this session. An edit built from what you remember will
fail on text that is no longer there, and the failure will look like the tool is broken.

## MCP tools — EXAMPLE SECTION, replace with your own

<!-- Everything in this section is an example. Delete it if you configure no MCP servers.
     Otherwise list YOUR servers' tools, with the names exactly as the model receives them. -->

⚠️ **Their names are PREFIXED with the server name** — `<server>_<tool>`, not `<tool>`. For
example, a server configured as `notes` exposing `search` is offered as `notes_search`. Calling
the unprefixed name fails as a tool that does not exist. Use the names exactly as written below.

If one is not in your tool list this session, it is switched off. Do not work around it, do not
invent its answer, and do not try to reach the same data by `bash`. Say it is unavailable.

### notes — an example knowledge-base server

| Tool | Use it for |
|---|---|
| `notes_search` | Find notes by keyword. Start here for facts about the project's environment and past decisions. |
| `notes_read` | Read one note whole, by its id. |

⚠️ **Pin any word the server shares with your project.** If the server is called "vault" and the
project also has a `vault/` directory, say which is which here: the server is reached through its
tools and is not on this filesystem; the directory is read with `read` and `glob`.

An empty result means *those words* are absent. It never means the topic is undocumented. Try
different wording before concluding anything.

### diagnostics — an example read-only diagnostics server

| Tool | Use it for |
|---|---|
| `diagnostics_scan_logs` | Something is wrong: match recent logs against known faults. Try this first. |
| `diagnostics_service_probe` | Is one service up? |

Every match a diagnostics tool returns is a **hypothesis**. Confirm it before acting on it.

## The fences, so they do not surprise you

These are OpenCode's defaults plus the hardened config. They are not faults, and repeating a
blocked call will not change the answer.

- **Files outside the project directory** need approval (`external_directory`). Your project
  directory and `/tmp` are already allowed. Everything else asks.
- **`bash` is not covered by the file fence.** A shell command can reach anywhere the fence
  would otherwise stop. That is not permission to go there. Stay inside the project.
- **`ssh`, `scp`, `rsync` and `webfetch` are denied.** You have no business leaving this machine.
- **`.env` files** need approval to read.
- **Do not repeat a call that returned the same result twice.** If a check says something is
  absent, change the state — create it, fix it — or say you are stuck. OpenCode's `doom_loop`
  guard is meant to stop identical repeated calls, but it did not catch a repeated `bash` call on
  1.18.31, so the rule is yours to keep.
