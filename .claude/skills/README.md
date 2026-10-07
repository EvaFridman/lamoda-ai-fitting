# Agent skills

Skills Claude Code loads for this repository. Agent configuration is executable code
(`CONTRIBUTING.md`, rule 2): every skill here was reviewed before it was added, and every update is
reviewed again.

## Third-party skills

Copied byte-identical from upstream and excluded from Prettier, so they can be compared with the
source. Do not edit them; to update, copy the new upstream version and review the diff.

| Skill                | Source                                                                | Version                  | Hash                                                               | Added      |
| -------------------- | --------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------ | ---------- |
| `prisma-cli`         | [prisma/skills](https://github.com/prisma/skills)                     | 7.9.1                    | `aaec1e0169bb8ae74b0e3c4b39a4ed00cef79741df42fb9c93771736fccf378f` | 2026-10-06 |
| `prisma-client-api`  | [prisma/skills](https://github.com/prisma/skills)                     | 7.9.1                    | `cbbabff961c8e16b2d59f8c1ffb4e7e20be52154e778ab95121e0211d6d09969` | 2026-10-06 |
| `temporal-developer` | [temporalio/agent-skills](https://github.com/temporalio/agent-skills) | 0.6.2 (commit `b394be7`) | `eb2ee6799b052e86ebc9e492b601bfab7cead4f05055472b642abf952808c2d9` | 2026-10-07 |

Hash: for the Prisma skills, `computedHash` from upstream `skills-lock.json`; for
`temporal-developer` (no lock file upstream), SHA-256 of the sorted `shasum -a 256` lines of the
copied files, computed inside the skill folder.

Review notes (2026-10-06): Markdown only, no scripts or `allowed-tools`, links only to prisma.io and
GitHub. `prisma-cli` documents `db push` and `migrate reset`; this project forbids both and
the Bash guard (`.claude/hooks/main-rules.mjs`) blocks them, which takes precedence.

Review notes for `temporal-developer` (2026-10-07): Markdown only, no scripts or `allowed-tools`;
links to temporal.download, docs.temporal.io, GitHub and the docs of integrations (AI SDK, Mastra,
Braintrust). Only `SKILL.md`, `references/integrations.md`, `references/core` and
`references/typescript` are copied: the other SDK languages are left out, so `SKILL.md` links to
them lead nowhere. The skill runs Temporal with `temporal server start-dev`; this project runs it in
Docker Compose (`CLAUDE.md`), which takes precedence. MIT licence.

## Project skills

Written for this repository; edited like code.

| Skill | Purpose                                                                                 | Used by                    |
| ----- | --------------------------------------------------------------------------------------- | -------------------------- |
| `fsd` | Feature-Sliced Design as `web/` applies it: layers (`_app`, `_pages`), slices, segments | main agent, `fsd-reviewer` |

Not added: `prisma-orm-setup` defaults new applications to Prisma 8 (a release candidate; this project
pins Prisma 7, see `CLAUDE.md`); `prisma-upgrade-v7` is a v6-to-v7 migration guide; the MongoDB,
Prisma Postgres and Compute skills cover products this project does not use.
