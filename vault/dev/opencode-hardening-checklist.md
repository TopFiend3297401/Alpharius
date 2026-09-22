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

## Corrections, 2026-09-20

- ✅ **The `webfetch` permission caution is STALE.** It was recorded against OpenCode **1.18.19**.
  Verified on **1.18.25 and 1.18.31** with a control: a `"webfetch": "deny"` block loads fine and
  `opencode models` exits 0. **The fence can and should deny network escape** — which is what
  [[fencing-the-shell]] wanted and believed it could not have.
- ⚠️ **LSP needs its own config or it becomes noise.** With no `pyrightconfig.json`, every Python
  file reports unresolved imports, and a model observed on 2026-09-20 dismissed a genuine
  diagnostic as *"a tooling config issue, not a code problem"*. It later wrote the config itself and
  the diagnostics went clean — but **a noisy verification channel trains a model to ignore that
  channel.** Ship `{"typeCheckingMode":"basic","extraPaths":[".venv/lib/pythonX.Y/site-packages"]}`.
- ⛔ **The oracle must live outside the repository.** See [[the-oracle-must-be-hidden]].

## 2026-09-22 — harness comparison and follow-ups

- [x] Three-harness comparison run (OpenCode 1.18.32, Pi 0.87.0, DeepSeek Harness 0.1.5-rc.3). [[harnesses-are-a-variable]].
- [x] `"webfetch": "deny"` added to `projects/opencode-configs/opencode.hardened.json`; [[fencing-the-shell]] and `harden-opencode` corrected to match the 2026-09-20 finding above.
- [x] P2b grounding layer copied into `projects/opencode-configs/grounding/` as templates.
- [ ] **Install `rust-analyzer` on Origin** (`rustup component add rust-analyzer`, or the distro package) — `"lsp": true` was inert for Rust on 2026-09-22 and no language server spawned per `opencode.log`. Then confirm one starts. [[lsp-external-verification]].
- [ ] **Raise the output cap for thinking models** in the Origin provider config to ≥16k — 8192 was exhausted by reasoning on one run and `opencode run` exited with no final message.
- [ ] Re-test `doom_loop` on the current OpenCode against a repeated bash call; it did not fire on 1.18.31.
- [ ] Origin's live `~/.config/opencode/alpharius/tool-inventory.md` still says `doom_loop` stops repeated calls; bring it in line with the shipped template.
- Pi extension (`projects/pi-extension/`) and DSH oracle gate (`projects/dsh-oracle-gate/`) — in progress.
