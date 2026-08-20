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
