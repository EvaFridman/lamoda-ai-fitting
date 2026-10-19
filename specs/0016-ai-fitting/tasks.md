# 0016 AI fitting: tasks

Status: accepted (2026-10-19).
No `plan.md`: the spec holds no code (S14). `👤` marks a step only the owner can do.

## How the work flows

One pull request with the documents (S14), committed on its own branch from `main`, without spec
0015's documents (S1). The pull request carries `Closes #84` under
"Что сделано". After it the spec stays accepted; the spec of the digital twin records AC5–AC15 and
closes it (S18).

## PR 1 · `docs/0016-ai-fitting` · documents

- [x] **T1. Research, spec, clarifications and tasks.** `research.md`, `spec.md`, `clarifications.md`
      (S1–S18), `tasks.md`; AC1–AC4 recorded below.
      Check: owner's acceptance of each file; `👤` the buyout figure of The Blueprint checked by hand;
      `rg "⚠" specs/0016-ai-fitting` finds nothing; `npm run format:check`.
      Commit: `docs(specs): add spec 0016 ai fitting`
- 👤 merges PR 1.

## Acceptance record

Checked at T1, 2026-10-19.

- **AC1. Pass.** Every fact about a competitor in `research.md` names its source;
  twelve key facts were checked against primary sources on 2026-10-19 and corrected (Gemini 2.5
  Flash Image's shutdown date refuted, prices of GPT-Image-2 and Nano Banana 2.1, Zalando's and
  Zara's wording); `rg "⚠" specs/0016-ai-fitting` finds nothing. Lamoda's buyout of 40% in The
  Blueprint's interview was checked by the owner on the page itself.
- **AC2. Pass.** "Product" holds saved photos ("Which photo", the twin's photos), history
  ("History"), outfits of several items ("What to try on") and the digital twin with style and photo
  edits ("Digital twin", "Scene").
- **AC3. Pass.** "Roadmap" names every item of `specs/backlog.md` (`main`, 17dc288) about photos,
  generations or try-on: "Product card link", "Photo upload limits", "Outbox for file deletion",
  "Signed links in reports", "Storage backups", "Deleted users in backups", "Long writes after a
  timeout", "Heartbeats for long activities", "Temporal history backup", "Fitting sessions per
  user", "A revoked session on an open socket" and "Guests".
- **AC4. Pass.** `spec.md` names no library, route, table or file of the code; models (S7), money
  (S11–S13) and the prototype's scope (S6, S12) come from `clarifications.md`.
