# 0001 Bootstrap: repository, CI, CD

Status: accepted (2026-10-05), amended the same day for blue-green deploys (D6a): AC13, AC18,
AC19, AC26.
Decisions this spec relies on: [clarifications.md](clarifications.md) (referred to by their ids, e.g. B7).

## Goal

A working skeleton of the project, delivered to production automatically: every later feature starts
from a repository where the stack is installed, quality checks run on every change, and a merge into
`main` reaches https://lamoda-ai-fitting.ru without manual steps.

The skeleton has no business features. Its only visible behavior is a page that says "Hello, world!",
with the text coming from the api, which proves the whole chain (browser → nginx → web → api) works.

## In scope

1. Repository layout, shared tooling and git hooks (A1–A11).
2. `api`: NestJS app with the stack from B1–B14 installed and wired up, a `GET /hello` endpoint,
   liveness and readiness health checks, Swagger, a temporal-worker process with one trivial workflow.
3. `web`: Next.js app with the stack from C1–C8, FSD layout, one page showing the api's greeting.
4. Docker: images for `api` and `web`, a local dev setup, a production overlay (D1, D2, D4).
5. Production server: nginx with Let's Encrypt certificates via certbot (D3); the old stack removed (F1).
6. CI on GitHub Actions: secret scan, quality checks, production image build and smoke test.
7. CD on GitHub Actions: on every push to `main`, the checked images are deployed to the VPS (D6).
8. Project documentation: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `specs/principles.md`,
   `deploy/README.md`.

## Non-goals

- Authentication and user accounts (B9, spec `0002-auth`).
- Any business feature, database model or migration (E3).
- A server dev or staging environment (D4).
- RabbitMQ, mail, PDF (B10, B13).
- Database backups and restore. They matter once real data exists; a separate spec before launch.
- Monitoring and alerting beyond Sentry; Temporal high availability; running more than one instance
  of any service.
- Deleting the old stack's volumes and `/opt/realty` (F1: the owner does it by hand; this task only
  documents the check and the command).

## Acceptance criteria

Each criterion is checked by the command or action next to it.

### Local development

- AC1. On a fresh clone, `npm ci` in root, then `./scripts/init-env.sh && docker compose up -d --wait`
  brings up every service as healthy (or running, for services without a health check).
- AC2. http://localhost:3001 shows "Hello, world!", and the text comes from the api: with the `api`
  container stopped, the page shows an error state instead of the greeting.
- AC3. `curl localhost:3000/health/live` → 200. `curl localhost:3000/health/ready` → 200 and reports
  Postgres, Redis and Temporal as up; after `docker compose stop redis` it → 503 naming Redis.
- AC4. Swagger UI opens at http://localhost:3000/docs and lists `GET /hello`.
- AC5. Temporal UI opens at http://localhost:8233; starting the hello workflow on the worker's task
  queue completes with "Hello, world!".
- AC6. A WebSocket client connected to the api gets a reply to a ping event.
- AC7. Editing a file in `api/src` or `web/src` is picked up without rebuilding the image.
- AC8. Over the limit set for the throttler, the api answers 429.

### Quality checks

- AC9. From root, each of these exits 0 on a clean checkout: `npm run format:check`, `npm run lint`,
  `npm run lint:css`, `npm run typecheck`, `npm test`. Tests run on Vitest (B7), at least one in api.
- AC10. A commit with a message that breaks A5 (e.g. `update stuff`) is rejected by the hook.
- AC11. A commit that stages a fake secret (e.g. a Postgres URL with a high-entropy password) is
  rejected by gitleaks.
- AC12. `docker build` of the `web` production image succeeds with no api, Redis or database
  running (C7).

### CI

- AC13. A pull request to `main` runs the checks from AC9, gitleaks over the full history, and a
  build of both production images followed by a smoke test: the images start with the production
  compose files behind nginx, the page contains "Hello, world!", and a blue-green switch to a second
  copy completes with no failed request (the AC26 check, run in CI).
- AC14. A pull request with a failing test, lint error or type error gets a red status.
- AC15. Images are published to GHCR, tagged with the commit hash, only on a push to `main`, never
  from a pull request.

### CD and production

- AC16. After a merge into `main` and green CI, the new version is live at
  https://lamoda-ai-fitting.ru with no manual step; the deployed commit hash is visible (e.g. in
  `/health/live` or a page footer) and matches the merge commit.
- AC17. The deploy runs pending Prisma migrations before starting the new api (with zero
  migrations it is a no-op that still succeeds).
- AC18. If the new version does not become healthy, traffic is never switched to it: the deploy job
  fails (red) and the site keeps serving the previous version without interruption.
- AC19. A previous version can be redeployed by running the deploy workflow by hand with its commit
  hash. Rolling back to the version that ran right before the current one takes seconds (it is
  still running).
- AC20. `http://lamoda-ai-fitting.ru` and `https://www.lamoda-ai-fitting.ru` redirect to
  `https://lamoda-ai-fitting.ru`; the certificate is a valid Let's Encrypt one.
- AC21. Certificate renewal is automatic: `certbot renew --dry-run` on the server succeeds, and a
  renewed certificate is picked up by nginx without a manual reload.
- AC22. WebSockets work through nginx in production (the AC6 check against the public domain), and
  an upload request of 10 MB is not rejected by nginx with 413.
- AC23. From outside, only ports 22, 80 and 443 answer; Postgres, Redis, Temporal and the api are not
  reachable directly.
- AC24. The old stack's containers and images are gone from the VPS (`docker ps -a` and
  `docker images` show only this project's). `deploy/README.md` holds the check (users registered
  after 2026-10-02) and the command that deletes the old volumes and `/opt/realty`.
- AC25. No secret is in git: production secrets live in the GitHub Environment `production` and in
  the server's untracked `.env`; gitleaks over the full history is clean.
- AC26. Zero downtime: a loop of requests to the site (page and `/api/health/live`, several per
  second) running through a whole deploy gets no failed response.

## Owner actions (Claude cannot do them)

- Create the GitHub Environment `production` and enter the secrets the plan lists.
- Approve the steps that touch the VPS (SSH commands, stopping the old stack).

## Assumptions

Change them here if they are wrong.

- Upload size limit at nginx: 20 MB.
- Tool versions: the latest stable release of each at implementation time, exact versions pinned in
  Docker images and lockfiles.
- Web tests: Vitest as well, set up with the first web feature that has logic worth testing.
