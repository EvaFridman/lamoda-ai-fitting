# Agent skills

Skills Claude Code loads for this repository. Agent configuration is executable code
(`CONTRIBUTING.md`, rule 2): every skill here was reviewed before it was added, and every update is
reviewed again.

## Third-party skills

Copied byte-identical from upstream and excluded from Prettier, so they can be compared with the
source. Do not edit them; to update, copy the new upstream version and review the diff.

| Skill               | Source                                            | Version | `computedHash` (upstream `skills-lock.json`)                       | Added      |
| ------------------- | ------------------------------------------------- | ------- | ------------------------------------------------------------------ | ---------- |
| `prisma-cli`        | [prisma/skills](https://github.com/prisma/skills) | 7.9.1   | `aaec1e0169bb8ae74b0e3c4b39a4ed00cef79741df42fb9c93771736fccf378f` | 2026-10-06 |
| `prisma-client-api` | [prisma/skills](https://github.com/prisma/skills) | 7.9.1   | `cbbabff961c8e16b2d59f8c1ffb4e7e20be52154e778ab95121e0211d6d09969` | 2026-10-06 |

Review notes (2026-10-06): Markdown only, no scripts or `allowed-tools`, links only to prisma.io and
GitHub. `prisma-cli` documents `db push` and `migrate reset`; this project forbids both and
`.claude/hooks/guard-bash.sh` blocks them, which takes precedence.

Not added: `prisma-orm-setup` defaults new applications to Prisma 8 (a release candidate; this project
pins Prisma 7, see `CLAUDE.md`); `prisma-upgrade-v7` is a v6-to-v7 migration guide; the MongoDB,
Prisma Postgres and Compute skills cover products this project does not use.
