How skills are packaged and distributed for this repo. Facts verified against the OpenCode docs and skills.sh, 2026-08-20.

## Format

- A skill is a directory containing `SKILL.md` with YAML frontmatter. Required fields: `name`, `description`. Optional: `license`, `compatibility`, `metadata`.
- `name` must match `^[a-z0-9]+(-[a-z0-9]+)*$`, be 1–64 characters, and equal the containing directory name.
- `description` (up to 1024 characters) is what the agent reads when deciding to invoke — write it as "use when …" with concrete triggers, not as marketing copy.

## Where they load from

- OpenCode discovers skills natively from `.opencode/skills/<name>/SKILL.md`, `.claude/skills/<name>/SKILL.md` and `.agents/skills/<name>/SKILL.md` (project scope), and the same trio under the home directory (global scope). Agents invoke them through the built-in `skill` tool.
- Claude Code reads the `.claude/skills/` locations, so one installed copy serves both harnesses.
- Skill access can be fenced like everything else: `"permission": { "skill": { "*": "allow" } }` patterns in `opencode.json`.

## Distribution

- This repo keeps its skills in `skills/<name>/SKILL.md` as the publication home.
- skills.sh (the Agent Skills Directory) installs directly from GitHub repos: `npx skills add <owner>/<repo>`, with OpenCode and Claude Code both among its supported harnesses.
- One caution for our audience: a skill's body is context spent on every invocation. Skills written *for small models to invoke* must be far shorter than skills written for large models; the two in this repo are written for the capable-agent side (the human's assistant setting up the environment), which is the right home for the length.
