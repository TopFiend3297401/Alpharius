A second live Bonsai run, observed 2026-08-21, this time under the full fence. Model: Bonsai-27B
(1.125 bpw, `prism-ml/bonsai-27b` via LM Studio) driving OpenCode. Task: build
`Wayland-Desktop-Utility`, a Rust layer-shell application launcher, from a cold start. Repo had
`AGENTS.md` and a hardened `opencode.json` in place before the session began.

Verified by compiling the repository directly, 2026-08-21. Counts below are compiler output, not
estimates.

## The fence held

No wander. Across the whole session the model stayed inside the repository root: no `ssh`, no
`find /home`, no access outside the project. This is the same model that produced
[[case-study-the-vault-hunt]] one day earlier, on the same machine, given a comparable
path-resolution problem. The difference was [[grounding-with-agents-md]] plus
[[fencing-the-shell]], and the difference is total.

That is the finding worth keeping. The scaffolding works on the failure it was built for.

## Failure 1 — the confabulated blocker (new, not in the taxonomy)

The model's own status report listed as a hard blocker:

> Dependency for Wayland layer shell (wlr-layer-shell) is unavailable/missing from the crate index,
> requiring a fallback using raw sockets/FFI via libwayland.

Every part of that is false:

- `gtk4-layer-shell` 0.8.1 is on crates.io and resolves. So does `smithay-client-toolkit` 0.21.1.
  (`cargo info` confirmed both, 2026-08-21. Building either here would additionally need
  `gtk4-devel` and `gtk4-layer-shell-devel`, which are absent — the runtime
  `libgtk4-layer-shell.so.1.3.0` is present. That is a packaging step, not a missing crate.)
- The model never added any dependency to try. `Cargo.toml` carries three section comments —
  UI framework, Wayland layer shell integration, fuzzy string matching engine — with nothing
  beneath any of them. There was no failed resolution, because there was no attempt.

So the model reported the outcome of a check it never ran, then planned expensive remedial work
(raw sockets and FFI) downstream of the invented result.

This is adjacent to **narrated call** in [[failure-taxonomy]] but distinct. Narrated call is a
*missing* action: prose describes work, nothing happens, and the omission is at least visible as
absence. This is a *fabricated result*: the model asserts what an unperformed action returned, and
then reasons correctly from the false premise. It does not stall — it manufactures scope, and the
downstream plan looks diligent.

Proposed category: **confabulated blocker**. Structural remedy is different from narration's
(prompting and few-shot shape): it wants the harness to make the check cheap and its result part of
the record, so that a claim about the world has to be a tool result rather than a sentence.

## Failure 2 — work outside the build graph

`src/mod.rs` declares the four modules. In a binary crate that file is inert: `main.rs` is the crate
root and it never declares them. `cargo build` therefore compiles `main.rs` and nothing else.

- Errors the model was aware of, per its status report: 2, both in `main.rs`.
- Errors actually in `main.rs`: 5.
- Errors in the four modules never compiled: 33 — `ui.rs` 15, `app_indexer.rs` 16,
  `keybindings.rs` 2, `layer_shell.rs` 0. (Measured by wiring each module into a scratch crate
  root, 2026-08-21.)
- 517 of 736 written lines had never been seen by the compiler.

This matters for [[lsp-external-verification]]. The model *was* using the compiler and the compiler
*was* telling the truth — about a fifth of the tree. Feedback that is honest but partial reads as
progress, and the missing four fifths are invisible precisely because nothing complains about them.
External verification only grounds the code the build graph actually reaches.

Note also that none of the commands `AGENTS.md` mandates would have caught this.
`cargo check --workspace --all-targets`, clippy and `cargo test` all operate on targets; an
unreferenced source file is not a target. The gap is structural, not a matter of the model skipping
a step.

Candidate exoskeleton behaviour: after a write, assert the new file is reachable from a crate root —
or more generally, that files written this session are inside the build graph. Cheap, language-
specific, and it closes a hole the mandated commands cannot. Fits the compensation model in
[[exoskeleton-mcp-design]].

## Failure 3 — invented library APIs

The 38 errors are dominated by plausible-shaped names that do not exist: `std::path::PathInfo`
(for `Path`/`PathBuf`), `std::path::Join::new` (for `Path::join`), `std::env::home_dir()` treated as
returning `Result`, `Option::new`, `path.name()`, a bare `Anyhow` type. The shape is right and the
identifier is wrong — the low-bit signature, the same mechanism as **stale edit** but aimed at
library surface rather than file contents.

[[failure-taxonomy]] has no category for this and arguably should not: it is about tool mechanics,
and this is code correctness, which the compiler already counts for free. Worth stating explicitly
in the taxonomy that this axis is deliberately out of scope, so its absence does not read as an
oversight.

## Failure 4 — coherence loss across files

Not mechanics, and not caught by any single-file check:

- `KeyAction` is defined three times — `main.rs`, `ui.rs`, `keybindings.rs` — with different
  variants each time (`Quit` versus `QuitUtility`, `ToggleVisibility` present in two of three).
- `AppLaunchError::NotFound` is a unit variant in `main.rs` and is called with an argument in
  `ui.rs`.
- `ui.rs` declares `pub struct UISignal` and then writes `impl UiSignal`; `impl UiMessage` reads
  `self.apps`, a field on a different struct.

The model wrote each file coherently and the set incoherently. This is what "silent scope drift"
looks like when it stays inside the repo — the fence stops it leaving the directory, not losing the
thread between files.

## Requirement drift

Worth recording separately from the compile errors, because these would survive a green build:

- `spawn_application` is documented "completely detached from this utility" and then calls
  `process.wait()`, which blocks until the child exits — and calls it a second time on the already
  reaped child in the error path.
- A hardcoded `std::thread::sleep(200ms)` sits in the launch path of a program whose headline
  requirement is startup under 20ms.
- Launching is `xdg-open <app_name>`. `xdg-open` takes a file or URL; the `Exec` line that
  `app_indexer.rs` goes to the trouble of parsing is never used to launch anything.
- `sysconf 0.3` is the only non-obvious dependency present and nothing references it, while tokio is
  pulled in with `features = ["full"]` for the same sub-20ms binary.

The reasoning is locally plausible and globally wrong, which is the pattern across all four
sections. The core claim in [[failure-taxonomy]] — that small models fail at tool mechanics more
than at reasoning — held for the wander case. It does not obviously hold here. Under a fence, with
mechanics largely working, what remained were reasoning and coherence failures. That may just mean
the taxonomy measures what fails *first*.

## What to do with this

- Add **confabulated blocker** to [[failure-taxonomy]] once a second instance is observed. One
  sighting is an anecdote.
- Add a build-graph reachability check to [[exoskeleton-mcp-design]].
- Note the target-versus-file gap in [[opencode-hardening-checklist]] — no command list fixes it.
- This note is dev, not docs: the fence result is verified and solid, the taxonomy proposal is not
  yet earned.
