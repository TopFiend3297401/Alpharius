Design note for the exoskeleton MCP server: tools that compensate for small-model tool-mechanics failures. The design spec is [[failure-taxonomy]] — one countermeasure per category.

**STATUS 2026-08-20: v0.1.0 built and tested** (28 tests incl. a stdio protocol round-trip) at `projects/exoskeleton-mcp/exoskeleton.py`, test-first, zero dependencies. Decisions taken: Python 3 stdlib with the stdio JSON-RPC implemented directly (no SDK); legacy initialize-handshake MCP era for maximum client compatibility (modern 2026-07-28 `_meta` era is a follow-up); tools sit *beside* the harness builtins. Still open: whether small models reliably pick the exoskeleton tools over builtins — that is [[roadmap]] P4's measurement, not an assumption.

**⚠️ SCOPE CORRECTION 2026-08-23** — two of the four behaviours below already ship in OpenCode
1.18.19 and are on by default: the **repo jail** is `permission.external_directory` and **repeat
detection** is `permission.doom_loop`. Measured, not read: [[opencode-tool-surface]]. They were
active during [[case-study-the-vault-hunt]] and did not stop it, because `external_directory`
governs the path-taking tools and **not `bash`** — the hunt was a `find` in the shell. So the
built-in jail does not make [[fencing-the-shell]] redundant; the two cover different halves.

What is left genuinely unbuilt is the **anchored fuzzy edit** and the **path resolver**. Build
those; drop the other two. This also makes [[roadmap]] P4 honest: "stock tools" already means
"tools with a jail and a loop-breaker", and the earlier framing would have credited this server
with two wins the harness was already delivering.

## Principles

- Tiny tool surface, dead-simple schemas: few tools, mostly single string arguments, forgiving parsing. Every extra tool and every extra argument is a hallucination surface.
- Structure over instruction: guardrails live inside the tools, where the model cannot fail to follow them.
- Every tool result re-grounds: echo the working directory and a short relevant file listing, because a small model loses state across turns.

## Tools, mapped to the taxonomy

- **Anchored fuzzy edit** (kills stale edits): accepts an approximate anchor; matches whitespace-insensitively and with small tolerance; on failure returns the *nearest actual text* so the next attempt starts from reality, not memory.
- **Path resolver** (kills phantom paths): fuzzy name-to-path lookup inside the repo ("harness contract" resolves to the real file); returns candidates ranked, never guesses silently.
- **Repo jail** (kills wander structurally): every path argument is resolved and confined to the project root inside the tool. Escape attempts return a calm correction, not an error dump. Makes [[case-study-the-vault-hunt]] impossible rather than discouraged.
- **Repeat detection** (kills dead loops): the server notices an identical call arriving a third time and answers with a different, corrective message — a nudge with the current state — instead of the same error yet again.
- **State echo** (fights referent loss): cwd, file counts, and last-edit summary appended to every result.
- Narrated calls have no tool-side fix — that is a prompting and few-shot-shape problem; note it honestly in the docs.

## Integration

OpenCode `mcp` config, syntax verified 2026-08-20:

```json
{
  "mcp": {
    "exoskeleton": {
      "type": "local",
      "command": ["<runtime>", "<entrypoint>"],
      "enabled": true
    }
  }
}
```

## Open questions

- Language and SDK: Python (matches our tooling) or TypeScript (matches the MCP ecosystem's centre of mass)?
- Do the exoskeleton tools *replace* OpenCode's built-in edit tools or sit beside them? Beside risks the model picking the wrong one; replacing needs OpenCode tool-disable support — verify what is possible.
- How does the fuzzy edit report its tolerance so transcripts stay auditable?
- Measurement design lives in [[roadmap]] P4 — this server is a benchmark variable, not just a convenience.
