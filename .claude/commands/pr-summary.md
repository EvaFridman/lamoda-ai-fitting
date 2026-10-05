---
description: Draft a pull request description for the current branch against origin/main. Outputs text only.
allowed-tools: Bash(git fetch:*), Bash(git branch:*), Bash(git log:*), Bash(git diff:*), Read, Grep, Glob
---

!`git fetch -q origin main || echo "(fetch failed: origin/main may be stale)"`

Branch: !`git branch --show-current`

!`git log --oneline origin/main..HEAD`

!`git diff origin/main...HEAD --stat`

## Task

Write a pull request description in Russian, as one markdown block with a single section,
"Что сделано": grouped by purpose, not by file; name the key files. If the branch implements tasks
from `specs/*/tasks.md`, name the task ids. Nothing else: checks, deviations from the spec and open
items live in `specs/` and CI, not in the description.

Open changed files when the stat is not enough to explain a change. Do not create the pull request,
push, commit or change files; only output the text.
