Language-server diagnostics as external verification for small models. Config syntax verified against the OpenCode docs, 2026-08-20; measured effect not yet quantified (see the toolset-axis item in [[roadmap]]).

## The idea

- A 1-bit model's weakest asset is internal coherence: it cannot reliably notice that its own edit broke the file.
- OpenCode has native LSP integration: when a file is opened or edited, the matching language server runs and its diagnostics are fed back to the agent.
- That converts silent breakage into immediate, textual feedback inside the loop — exactly the substitute a small model needs. The same principle as test-first prompts, but at zero prompt cost and every single edit.

## Configuration

Enable all built-in servers (Pyright auto-installs for Python projects, similarly for TypeScript and others):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": true
}
```

Or selectively:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": {
    "pyright": {
      "command": ["pyright"],
      "extensions": [".py", ".pyi"]
    }
  }
}
```

- Per-server keys: `disabled`, `command`, `extensions`, `env`, `initialization`.
- `OPENCODE_DISABLE_LSP_DOWNLOAD=true` disables auto-download where that matters.

## Caveat for very small models

Diagnostics add tokens to every turn. For a model with a tight effective context, a noisy language server could crowd out the task — worth measuring, not assuming (open question in [[roadmap]]).

## Correction, 2026-09-22: enabling is not running

Measured on Origin, 2026-09-22, on a Rust task: `"lsp": true` was set, and it did **nothing**. `rust-analyzer` was not installed, OpenCode did not auto-install it, and `opencode.log` showed no language server spawned for the whole session. The run had no diagnostics channel at all while the config said it did.

- **Check the log, not the config.** After the first edit, confirm `opencode.log` records the language server starting. If it does not, the feedback loop this note describes does not exist.
- The OpenCode docs say some servers auto-install (Pyright for Python). Do not assume that covers your language — install the server yourself (`rustup component add rust-analyzer` for Rust) and re-check the log.
- A configured-but-inert verification channel is worse than a known-absent one: it is credited with catching breakage it never saw. The same principle as the seventh category in [[failure-taxonomy]] — the claim that a check ran is not evidence that it ran.
