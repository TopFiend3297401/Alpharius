How very small coding agents actually fail. Source: the taxonomy developed for the Coppice benchmark (multi-turn agentic degradation of low-bit quantised models), plus direct observation of Bonsai-27B (1.125 bpw) driving OpenCode, 2026-08-20.

The core claim: small models fail at tool mechanics more than at reasoning, and the failures are countable per category. Aggregate "it did badly" numbers hide which structural fix would help.

## The categories

- **Schema malformation** — arguments unparseable, or wrong argument names for a tool that exists.
- **Hallucinated tool** — a call to a tool that does not exist in this harness (often a tool name from a different agent's vocabulary).
- **Phantom path** — the target file does not exist. Distinct from legitimately creating a new file.
- **Stale edit** — an edit whose anchor text is not found in the file, because the model edited from its memory of the file rather than its current contents. The classic low-bit killer.
- **Repeat** — the identical call issued three or more times; the precursor to a dead loop.
- **Narrated call** — the model describes the action in prose but never emits the tool call. The eeriest one: the transcript reads as work being done while nothing happens.

Terminal outcomes these feed: dead loops, turn-limit exhaustion, and silent scope drift (touching files outside the task).

## Why count per category

- Each category has a different structural remedy: stale edits want a forgiving edit tool; phantom paths want a resolver; repeats want server-side loop detection; narration wants prompting and few-shot shape; hallucinated tools want a smaller, better-described tool surface. See [[grounding-with-agents-md]], [[fencing-the-shell]], [[lsp-external-verification]] and the exoskeleton design in the dev brain.
- A model can be fine on five categories and unusable through one. The fix is then one tool, not a bigger model.
