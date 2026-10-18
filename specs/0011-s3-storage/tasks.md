# 0011 S3 storage: tasks

Status: done (2026-10-19): all 14 criteria pass, AC6 on the CI runner, its production half
checked after PR 4's merge (record below). History, not instructions.
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
- [x] **T11. nginx serves `/media/`.** The `/media/` location and its cache, the S3 variables of
      nginx in `infra.yml`, the media check in `deploy.sh` after the seed, before the new copy
      (M31); `ci-deploy-check.sh`
      checks `/media/` through nginx, the second deploy's no-op and that the emulator never sees
      `X-Proxy-Secret` (plan §7).
      Check: `ci-deploy-check.sh` locally and in CI: 200 with `Cache-Control` and no `x-amz-*`, a
      missing key 404, `PUT`/`POST`/`DELETE` refused, `/media/` 404 (AC2, AC3, AC6 on the runner).
      Commit: `feat(deploy): serve the media from the storage through nginx`
- [x] **T12. Docs and backlog.** `CLAUDE.md`, `README.md`, `deploy/README.md` ("Хранилище S3",
      plan §9), `.claude/rules/deploy.md`, the backlog items of plan "Backlog".
      Check: the `spec-finder` agent finds no doc that still says media live in `web/public/media`;
      `npm run format:check`.
      Commit: `docs(docs): describe the s3 storage`
- 👤 before the merge (plan §9 step 2): sets the `media/*` policy and checks the address Timeweb
  sees; merges PR 3 at a quiet time (nginx is recreated).

## PR 4 · `fix/0011-close` · nginx after the media check, production checks and closing

- [x] **T13a. nginx changes after the media check.** `deploy.sh`: step 2 without nginx; the
      migrations, the seed and the bucket check from a throwaway container on the server; then
      nginx (recreated or its new config applied) and the check through it; then the new copy;
      the rollback to the running copy applies nginx as before (M38, plan §7). `ci-deploy-check.sh`:
      a deploy with a changed nginx config against a storage that refuses writes.
      `deploy/README.md` ("Как идёт деплой"), `.claude/rules/deploy.md`.
      Check: `ci-deploy-check.sh` locally and in CI: the refused write stops the deploy at the
      seed, the nginx container id and its rendered config are unchanged, `/media/` answers 200;
      every earlier step still passes. `security-reviewer` joins the review (deploy).
      Commit: `fix(deploy): change nginx only after the media check`
- [x] **T13b. Hide Timeweb's `x-rgw-object-type`.** `/media/` in production passes the storage's
      `x-rgw-object-type` on (seen in T13's AC2 check); nginx's list of hidden storage headers gets
      it; `ci-deploy-check.sh`
      refuses `x-rgw-*` and `Seaweed-*` on `/media/` too (M39). Check: `ci-deploy-check.sh`
      locally (the emulator sends `Seaweed-*`, not `x-rgw-*`); in production `curl -I` of a seed
      key after PR 4's merge shows no `x-amz-*` and no `x-rgw-object-type` (another `x-rgw-*`
      would be a finding for the list). `security-reviewer` joins the review (nginx).
      Commit: `fix(deploy): hide the storage's x-rgw-object-type header`
- [x] **T13. Close the spec.** The production checks (AC2, AC3, AC4, AC6–AC8, AC10, AC11, AC14,
      with the owner where the server or the panel is needed), the acceptance record below, every
      file gets `Status: done`. T13a's evidence is its CI run and the deploy log of PR 4's merge.
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0011`
- 👤 merges PR 4.

## Acceptance record

Production checks on 2026-10-18/19 by the main session, on the deploy of `82025f9` (PR 3's merge):
from the laptop with `curl`, and on the server (`ssh ai-fitting`) with a throwaway script that
read its keys from the server's `.env` and printed none. That script made a test user, two fitting
sessions with a generation each and three objects under `keep/users/<id>/`, and deleted them all
through the api. The local criteria rest on the checks of the tasks named. `npm run verify` on the
closing commit passed (api 2440 tests, web 1654, guards and scripts 577). Two criteria take part of their evidence from elsewhere
(M40). Checked after PR 4's merge, with the result in the pull request (M40): AC6's production
half (the merge's deploy is the second after PR 3), T13a (the CI run of PR 4 and that deploy's
log) and T13b (`curl -I` of a seed key without `x-rgw-object-type`).

| AC   | Result                                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass                                              | T10: `curl -I` of every seed key on :3001 answers 200 `image/webp`; the web container has no `public/media`                                                                                                                                                                                                                                                                                           |
| AC2  | pass                                              | All 78 seed keys on `https://lamoda-ai-fitting.ru/media/`: 200, `image/webp`, `Cache-Control: public, max-age=86400`, no `x-amz-*` header; Timeweb's `x-rgw-object-type` came through and is hidden by T13b (M39)                                                                                                                                                                                     |
| AC3  | pass                                              | A missing key, `/media/` and `/media/seed/`: 404 `NOT_FOUND`; `PUT`, `POST`, `DELETE` of a seed key: 404 `ROUTE_NOT_FOUND` (M30); a seed key, the bucket's root, a listing and `keep/` straight from `s3.twcstorage.ru` from the laptop (path and virtual-host style): 403 `AccessDenied`                                                                                                             |
| AC4  | pass                                              | Production `/dev/catalog` (12 photos) and `/ui-kit` (8): 200, and every `/media/` photo they reference answers 200, checked with `curl` instead of a browser (`qa-tester` reaches only the local stack); locally `qa-tester` in a browser in T10                                                                                                                                                      |
| AC5  | pass                                              | T10: CI's web image has no `public/media` (`test ! -e public/media`; the image copies no `public/`, M28)                                                                                                                                                                                                                                                                                              |
| AC6  | pass on the CI runner; production after the merge | First deploy (run 39166201696, attempt 2): `Seed done: 0 products created, 30 already there, 78 photos uploaded`, then `media/seed/products/OST-TS-004/2.webp answers 200 from the bucket and through nginx`; the second deploy on the CI runner in T11 uploaded nothing with every `ETag` unchanged; production's second deploy is PR 4's merge, checked after it (M40)                              |
| AC7  | pass                                              | On the server: a `keep/users/<id>/photos/…` object fetched unsigned from the bucket: 403; `/media/` of that key: 404; emulator: `storage.e2e-spec.ts` "refuses a private object"                                                                                                                                                                                                                      |
| AC8  | pass                                              | On the server: the admin `GET` of the test user returned a link to `s3.twcstorage.ru` that answered 200; 1042 s later the same link answered 500, refused (spec: "refused", plan risk: an expired link may answer 500); emulator: `storage.e2e-spec.ts` "is refused once it has expired"                                                                                                              |
| AC9  | pass                                              | T7: another user's key, a `media/` key, a `tmp/` key and any key on user create answer 400 `VALIDATION_FAILED` (`IN_OWNER_FOLDER`)                                                                                                                                                                                                                                                                    |
| AC10 | pass                                              | On the server: deleting a fitting session (204) and a generation (204) emptied that generation's folder within 5 s and left the user's photo; deleting the user (204) emptied `keep/users/<id>/` by the first listing. Storage unreachable: `file-deletion.e2e-spec.ts` "answers 204 with the storage unreachable and deletes the files once it is back" (M40)                                        |
| AC11 | pass                                              | The bucket's lifecycle as the api's key reads it: one rule, prefix `tmp/`, `Expiration` 1 day and `AbortIncompleteMultipartUpload` 1 day; no other rule                                                                                                                                                                                                                                               |
| AC12 | pass                                              | T4: `docker compose up -d --wait` on a fresh `.env` is healthy, `s3-init` exits 0; T9: `seed:dev` on an empty emulator uploads 78, a second run 0; `qa-tester` from a fresh clone in T10. The emulator's keys are random ones `scripts/init-env.sh` writes into `.env`, and nothing outside the compose services is called; a run with no internet at all (after the images are pulled) was not tried |
| AC13 | pass                                              | `npm run verify` above; the storage tests start their own SeaweedFS with Testcontainers (`api/test/support/`)                                                                                                                                                                                                                                                                                         |
| AC14 | pass                                              | On the server, the secret key's value in the config and history of the images of all 10 running containers (api, web, worker, nginx and the rest): 0; in their logs: 0 lines; in the files of the web container: 0; the CI and CD logs print only the script text that writes it to the server's `.env`; `check:web-bundle` in `verify`; the key id is in every signed link (M34)                     |
