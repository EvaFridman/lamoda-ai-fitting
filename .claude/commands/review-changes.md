---
description: Review uncommitted changes against CLAUDE.md and the active spec. Lists findings, changes nothing.
allowed-tools: Bash(git status:*), Bash(git diff:*), Read, Grep, Glob
---

## Uncommitted changes

!`git status --short`

!`git diff HEAD`

## Task

Review the changes above with the checklist and output format of `.claude/agents/code-reviewer.md`.
Read untracked files from the status list yourself: they are not in the diff.

Review only: do not edit, create, stage or format any file, and do not run fixers. If there are no
uncommitted changes, say so and stop.
