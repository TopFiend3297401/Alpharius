How very small coding agents actually fail. Source: the taxonomy developed for the Coppice benchmark (multi-turn agentic degradation of low-bit quantised models), plus direct observation of Bonsai-27B (1.125 bpw) driving OpenCode, 2026-08-20.

The core claim: small models fail at tool mechanics more than at reasoning, and the failures are countable per category. Aggregate "it did badly" numbers hide which structural fix would help.

## The categories

- **Schema malformation** — arguments unparseable, or wrong argument names for a tool that exists.
- **Hallucinated tool** — a call to a tool that does not exist in this harness (often a tool name from a different agent's vocabulary).
- **Phantom path** — the target file does not exist. Distinct from legitimately creating a new file.
- **Stale edit** — an edit whose anchor text is not found in the file, because the model edited from its memory of the file rather than its current contents. The classic low-bit killer.
- **Repeat** — the identical call issued three or more times; the precursor to a dead loop.
- **Narrated call** — the model describes the action in prose but never emits the tool call. The eeriest one: the transcript reads as work being done while nothing happens.
- **Self-certified completion** — the model declares a criterion met when it is not, and its declaration is the only evidence offered. Added 2026-09-22 (below). The model's account of done is not evidence; only an external oracle is.

Terminal outcomes these feed: dead loops, turn-limit exhaustion, and silent scope drift (touching files outside the task).

## The seventh category: self-certified completion (added 2026-09-22)

Measured 2026-09-22: eleven runs of Occamy-1.0 on one Rust maintenance task, across three harnesses (OpenCode 1.18.32, Pi 0.87.0, DeepSeek Harness 0.1.5-rc.3), each graded by a hidden 15-check oracle. Six runs failed the criterion "the binary reports alerts". **All six claimed it passed.** Several had diagnosed the cause of the failure in their own transcript and then argued it away before reporting success.

None of the first six categories covers this. Every tool call in those runs could be well-formed, real, current, non-repeating and emitted, and the run still ended in a false claim. It is not a tool-mechanics failure at all; it is a failure of the *report*, and it is the one that reaches the human.

- **Detection:** only by comparing the model's final claims against an oracle it cannot read ([[the-oracle-must-be-hidden]]). A transcript alone cannot detect it, because the transcript is the model's own account.
- **Remedy:** structural, not prompt-level. Grade with an external oracle, and where the harness has a completion signal (a `/goal`, a stop hook), gate that signal on the oracle rather than on the model's say-so. Restating criteria as observable outputs helps the model check itself, but does not replace the oracle. See [[harnesses-are-a-variable]].
- **Why it matters for counting:** a run can score zero on all six mechanics categories and still be the worst kind of failure, because it is the only one that is invisible until someone checks.

## Why count per category

- Each category has a different structural remedy: stale edits want a forgiving edit tool; phantom paths want a resolver; repeats want server-side loop detection; narration wants prompting and few-shot shape; hallucinated tools want a smaller, better-described tool surface; self-certified completion wants an external oracle gating the harness's notion of done. See [[grounding-with-agents-md]], [[fencing-the-shell]], [[lsp-external-verification]] and the exoskeleton design in the dev brain.
- A model can be fine on six categories and unusable through one. The fix is then one tool, not a bigger model.
