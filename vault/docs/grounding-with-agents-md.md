Pinning referents so a small model cannot wander. Motivated by a real incident: [[case-study-the-vault-hunt]].

## The problem

- A prompt says "read vault/00-meta/contract.md". The model fails to resolve the relative path on its first try.
- A large model retries relative to the working directory. A small model generalises the *word*: it starts searching the filesystem for anything called "vault" — and a word like vault, docs or notes may match directories that have nothing to do with the task.
- Instructions in the prompt decay over a long loop. The model needs an anchor that is re-read, not remembered.

## The fix

- Put an `AGENTS.md` in the repo root — OpenCode reads it natively and it survives the whole session.
- It must pin, in order of importance:
	- the absolute path of the repository;
	- the meaning of every load-bearing noun the prompts will use ("the vault means `<abs-path>/vault`; no other directory named vault is relevant");
	- the boundary: work only inside this repository, never ssh;
	- anything the model must never do that a permission fence cannot express.
- Use absolute paths in prompts for any file the model must read before it has its bearings.
- Negative instructions alone are weak for small models — pair this with the structural fence in [[fencing-the-shell]]. Grounding reduces the *wish* to wander; the fence removes the *ability*.

Template: `projects/opencode-configs/AGENTS.template.md`.

Verified 2026-08-20: an OpenCode session with no AGENTS.md wandered ([[case-study-the-vault-hunt]]); OpenCode's docs confirm AGENTS.md is read natively.
