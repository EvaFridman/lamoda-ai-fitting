# 0011 S3 storage: tasks

Status: accepted (2026-10-16).
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main` (M18).
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box. A fresh session (or `/clear`) per task.
- Temporal code (T8) is written with the `temporal-developer` skill and reviewed by
  `temporal-reviewer`; T4, T5 and T11 touch config, deploy or `.claude/`, so `security-reviewer`
  joins their review.
- The pull request of PR 4 carries `Closes #43` under "Что сделано".

## PR 1 · `docs/0011-spec` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (M1–M11).
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add spec 0011 s3 storage and its first decisions`
- [x] **T2. Plan.** `plan.md`; the spec amended and M12–M18 recorded at the plan.
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the plan of spec 0011 and amend its spec`
- [x] **T3. Tasks.** This file.
      Check: owner's acceptance; `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0011`
- 👤 merges PR 1.

## PR 2 · `feat/0011-storage` · storage, users' files and their deletion

- [x] **T4. Emulator and configuration.** `@aws-sdk/client-s3` (M20); the S3 variables in
      `api/src/config/env.ts` with their tests (M19), `.env.example`, `scripts/init-env.sh` (random local keys), `api/vitest.config.ts`
      (closed port); the `s3` and `s3-init` services in `docker-compose.yml` with
      `api/src/storage/dev-setup.ts` (the `media/*` read policy and the `tmp/` rule); README's
      quick start and second copy (`S3_HOST_PORT`); `qa-tester` may reach 8333/8334 (its rules,
      agent file, `.claude/README.md`, a case in `guards.test.mjs`) (plan §1, §8).
      Check: `docker compose up -d --wait` on a fresh `.env` is healthy; `s3-init` exits 0 and a
      second run changes nothing; `GetBucketPolicy` and `GetBucketLifecycleConfiguration` show the
      rules; `npm run verify`.
      Commit: `feat(infra): add the local s3 emulator and the storage settings`
- [x] **T5. Storage settings in CI and deploy.** The S3 variables in `deploy/compose/app.yml`,
      `worker.yml`, `cd.yml` (secrets and variables into `.env`) and `scripts/ci-deploy-check.sh`
      (a SeaweedFS container on the runner); `check:web-bundle` fails on the S3 variable names
      (plan §1, §8).
      Check: `scripts/ci-deploy-check.sh` passes locally; `node --test` of the bundle check covers
      the new names; CI green on the branch.
      Commit: `ci(deploy): pass the storage settings to the api and the worker`
- [x] **T6. Storage module.** `@aws-sdk/s3-request-presigner` (on `@aws-sdk/client-s3`'s version), `testcontainers`; `api/src/storage/` (clients, `StorageService`,
      `keys.ts`); `api/test/support/storage.ts` as a second `globalSetup` of `database`;
      `createTestApp()` wired to it; `test-writer` may use the throwaway SeaweedFS and Temporal
      (M17: its agent file, `.claude/README.md`) (plan §2, §8).
      Check: e2e against the emulator — put with metadata and `Cache-Control`, `exists`,
      `deletePrefix` over more than 1,000 keys, a signed link 200 and refused after a short TTL, an
      unsigned `keep/` read refused (AC7, AC8); unit tests of `keys.ts`; `npm run verify` (AC13).
      Commit: `feat(api): add the s3 storage module`
- [x] **T7. Signed links and the owner check.** `fittingProfileImageUrl`, `userImageUrl`,
      `resultImageUrl` in the responses; keys outside `keep/users/<owner>/` refused with
      `VALIDATION_FAILED`; `api/openapi.json` rewritten; web's user and generation schemas and
      their contract tests (plan §3).
      Check: e2e — a link from an admin `GET` opens the file (AC8); another user's key, a `media/`
      key, a `tmp/` key, any key on user create answer 400 (AC9); web contract tests pass.
      Commit: `feat(api): give users' files signed links and refuse keys of other users`
- [x] **T8. Files deleted through Temporal.** `deleteFiles` workflow and `deletePrefix` activity,
      `startFileDeletion` after the delete of a user, a session and a generation; the worker gets
      `StorageService`; bounded starts and `close()` after the starts in progress
      (`TemporalClientModule`); a throwaway Temporal container in the tests (M16) (plan §4).
      Check: e2e with Temporal and the emulator — each delete removes its folders, a generation's
      delete keeps the user's photo; the emulator paused, a delete answers 204, the files go within
      a minute of its return (AC10); an app closed during a start throws nothing; `npm run verify`.
      Commit: `feat(api): delete users' files through temporal`
- 👤 before the merge (plan §9 steps 1, 3, 4): creates the bucket, its `tmp/` rule and the api's
  user; sets `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (secrets) and `S3_BUCKET`, `S3_ENDPOINT`
  (variables) in GitHub `production`; merges PR 2.

## PR 3 · `feat/0011-media` · the catalog media in the bucket

- [x] **T9. The seed uploads its photos.** `git mv` of the 78 files to `api/seed-media/`;
      `api/Dockerfile` copies them; the seed uploads the missing ones with `image/webp` and
      `MEDIA_CACHE_CONTROL`; the seed test reads the new folder and seeds twice (plan §5).
      Check: `seed:dev` on an empty emulator uploads 78, a second run 0 (AC6, AC12); the seed
      e2e passes.
      Commit: `feat(api): upload the demo catalog's photos with the seed`
- [x] **T10. web without its media.** `web/public/media` gone with its header rule; the
      development rewrite of `/media/` to the emulator (plan §6).
      Check: `curl -I` of every seed key on :3001 (AC1); `qa-tester` on `/dev/catalog` and
      `/ui-kit` (AC4); the built web image has no `public/media` (AC5).
      Commit: `feat(web): serve the media from the storage`
- [ ] **T11. nginx serves `/media/`.** The `/media/` location and its cache, the S3 variables of
      nginx in `infra.yml`, the media check in `deploy.sh` before the switch; `ci-deploy-check.sh`
      checks `/media/` through nginx, the second deploy's no-op and that the emulator never sees
      `X-Proxy-Secret` (plan §7).
      Check: `ci-deploy-check.sh` locally and in CI: 200 with `Cache-Control` and no `x-amz-*`, a
      missing key 404, `PUT`/`POST`/`DELETE` refused, `/media/` 404 (AC2, AC3, AC6 on the runner).
      Commit: `feat(deploy): serve the media from the storage through nginx`
- [ ] **T12. Docs and backlog.** `CLAUDE.md`, `README.md`, `deploy/README.md` ("Хранилище S3",
      plan §9), `.claude/rules/deploy.md`, the backlog items of plan "Backlog".
      Check: the `spec-finder` agent finds no doc that still says media live in `web/public/media`;
      `npm run format:check`.
      Commit: `docs(docs): describe the s3 storage`
- 👤 before the merge (plan §9 step 2): sets the `media/*` policy and checks the address Timeweb
  sees; merges PR 3 at a quiet time (nginx is recreated).

## PR 4 · `docs/0011-close` · production checks and closing

- [ ] **T13. Close the spec.** The production checks (AC2, AC3, AC4, AC6–AC8, AC10, AC11, AC14,
      with the owner where the server or the panel is needed), the acceptance record below, every
      file gets `Status: done`.
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0011`
- 👤 merges PR 4.

## Acceptance record

Filled in by T13.
