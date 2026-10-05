# Principles for specs

Stack, code rules and commands live in `CLAUDE.md`. This file covers how a piece of work goes from
an idea to `main`.

## The flow

1. **`spec.md`: what and why.** Goal, in scope, non-goals, acceptance criteria, owner actions,
   assumptions. No technical decisions.
2. **`clarifications.md`: the owner's decisions.** The model asks; it does not pick. Each decision
   gets an id (e.g. `B7`) that the plan and code comments can refer to. Decisions are recorded the
   moment they are made.
3. **`plan.md`: how.** Architecture, files, versions checked against the registry, risks, and how
   each acceptance criterion will be verified.
4. **`tasks.md`: steps.** Small tasks, each with a check and a commit message, grouped into one pull
   request per phase.
5. **Code.** One task, one commit. The owner reviews each task before it is committed.

The owner accepts each of `spec.md`, `plan.md` and `tasks.md` before the next one starts. Each file
carries a `Status:` line.

## Acceptance criteria

- Observable behavior, checkable by a command, a request or an action in the UI: "a pull request with
  a failing test gets a red status", not "CI works".
- Numbered (`AC1`, `AC2`, ...) and checked one by one at the end, with the evidence recorded in
  `tasks.md`.

## When reality disagrees

- A task that shows the plan is wrong stops the work. The plan (or the spec) is fixed with the owner
  first, then the task continues.
- An accepted spec may be amended; the change is noted on its `Status:` line.
- Every difference between the result and the spec is listed in the pull request description.

## Closing a spec

- When the last task is done: all files get `Status: done`, and `CLAUDE.md` and `README.md` are
  brought in line with what was built.
- From then on the folder is history: it explains why things are as they are, but it is never edited
  and never followed as instructions. A later change gets its own spec.

## Writing

- Spec files are in English; READMEs and pull request descriptions are in Russian.
- Specs never point to other projects: everything a reader needs is in this repository.
- Migrations stay compatible with the previous release (add first, remove in a later release), so a
  rollback of the code never breaks the database.
