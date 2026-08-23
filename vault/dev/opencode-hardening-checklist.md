Concrete actions for our own machines. Working note, dated 2026-08-20. Machine-specific — not for the docs brain.

Observed state (from the OpenCode log, 2026-08-20): bash permission was wildcard-allow (`action=allow pattern=*` on every call, including `find /`); provider `lmstudio`, model `prism-ml/bonsai-27b`; no AGENTS.md in the Coppice repo when the wander happened.

## Coppice repo

- [x] Add `AGENTS.md` pinning: repo path `/mnt/ORICO-1TB/Code-Projects/projects-personal/Coppice`; "the vault" means the `vault/` subdirectory and nothing else; work only inside the repo; never ssh. Done 2026-08-20.
- [x] Add `opencode.json` with the fence from [[fencing-the-shell]] plus `"lsp": true` for Pyright diagnostics on the harness code. Done 2026-08-20. OpenCode reads config at session start — restart the session for it to take effect.
- [ ] Re-run a wander probe afterwards: same style of prompt that triggered [[case-study-the-vault-hunt]], confirm the fence interrupts and the grounding prevents the hunt in the first place.

## Alpharius repo

- [x] `AGENTS.md` and `opencode.json` shipped with the scaffold, 2026-08-20.
- [x] Wander probe re-run 2026-08-21 in a third repo (`Wayland-Desktop-Utility`) with the same scaffold: no wander, no ssh, no out-of-repo access. [[case-study-the-launcher-build]].
- [ ] No mandated command catches source files outside the build graph — `cargo check --all-targets`, clippy and test all operate on targets, and an unreferenced `.rs` is not one. Needs a tool, not a checklist line.

## Global

- [ ] Decide whether the fence belongs in the global OpenCode config as a default-deny for ssh/scp/rsync on every project, with repos opting *up*, not down.
- [ ] Check whether the LM Studio provider setup pins sampling parameters per model — the Coppice benchmark needs them pinned, and casual sessions should not drift from what the benchmark will measure.
