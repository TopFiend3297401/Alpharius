A live wander incident, observed 2026-08-20, reconstructed from the OpenCode log. Model: Bonsai-27B (1.125 bpw, `prism-ml/bonsai-27b` via LM Studio). No AGENTS.md, permissive bash config.

## What happened

- The model was prompted, in a correct working directory, to read `vault/00-meta/harness-contract.md` — a relative path that existed.
- It failed to resolve the path on its first attempt. Instead of retrying relative to the working directory, it generalised the word: it began searching the machine for anything called "vault".
- Logged commands, all auto-allowed by the wildcard permission:
	- `find /home/<user> -path "*/mind-vault*"`
	- `ls -la /home/<user>/Documents/mind-vault`
	- `find / -path "*/vault/*harness*"`
	- `ls -la /home/<user>/.claude/vault`
- Two of those targets were a *personal knowledge vault* entirely unrelated to the project — the model had seen the name somewhere in ambient context and treated it as a candidate referent for "the vault".
- All activity was read-only and, on this machine, the searches came back empty. No harm done — this time.

## What it teaches

- **Referent loss is the root failure**, not disobedience. The model was trying to comply; it had no anchor for a load-bearing noun, so it resolved the noun against the whole filesystem. See [[failure-taxonomy]] — this is the phantom-path family expressed at directory scale.
- **The near-miss was structural luck.** With an ssh key and a permissive fence, the same search pattern continues onto other machines. The fix cannot be "hope it stays local".
- **Layer the three levers**: pin the noun ([[grounding-with-agents-md]]), fence the shell ([[fencing-the-shell]]), and make the model's next mistake visible to itself ([[lsp-external-verification]]).
- **Wildcard-allow is an observability gift and a safety hole**: the log recorded every step perfectly, and stopped none of them.

## Epilogue

Same model, same session lineage, after the referent was supplied directly: it built a working, spec-conformant file generator with validation and a self-test, first prompt, passing 17 of 21 adversarial conformance checks written afterwards by a reviewer. The gap between "wandering the filesystem" and "shipping working code" was one resolved noun. That is the whole thesis of this repo.
