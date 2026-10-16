# 0011 S3 storage

Status: accepted (2026-10-16).

Issue #43. Decisions: `clarifications.md` (M1–M11; Q1 and Q3 are answered in the plan).

## Goal

Files live in the web image today: the catalog's placeholder photos are static files of web (0002
C9a), and users' photos and generation results have nowhere to go. This spec moves the catalog
media to a public bucket of Timeweb Cloud's S3 storage, served at the site's own `/media/`
addresses, and prepares a private bucket for users' photos and generation results (M1): how their
files are named, how a page gets a short-lived link to one, and how they are deleted together with
their owner. No route writes users' files yet; photo upload and generations come in their own
specs.

## In scope

- The catalog media in the public bucket (M1, M2), served at the same `/media/<key>` addresses as
  today, from the site's own origin (M3). The web image no longer carries them.
- Placing the demo catalog's photos in the public bucket on deploy and in the local stack, without
  changing objects that are already there.
- The private bucket for users' photos and generation results: closed to unsigned requests; the
  admin responses of users and generations carry short-lived links to their files (0004 E47, E51).
- Names (keys) of private files: built by the server, every file inside its owner's folder with
  the owner's user id (M7).
- Deleting a user or a generation deletes its files, retried until done (M11, backlog "File
  storage").
- Admin writes of users' and generations' image keys accept only keys in the owner's folder (M8).
- Expiry: users' files are kept with no time limit (M4); unfinished uploads are removed after a day.
- A local S3-compatible emulator for the Docker stack and the tests: development and `verify` need
  no internet access and no real keys.
- The backlog item "File storage" is closed or narrowed to what photo upload owes.

## Non-goals

- Photo upload and AI generations (their own specs).
- Image columns for categories and brands, and promo videos (M2).
- Database backups (issue #42): spec 0012, with a bucket and a key of its own (M6).
- Backups and versioning of the two buckets.
- A CDN in front of `/media/`.
- Ownership checks for signed-in users (backlog "IDOR checks with auth"): the routes stay admin-only.

## Acceptance criteria

### Public media

- AC1. Locally, for every image key of the seed, `curl -I http://localhost:3001/media/<key>`
  answers 200 with `Content-Type: image/webp`, and the file is not inside the web container.
- AC2. In production, `curl -I https://lamoda-ai-fitting.ru/media/<key>` answers 200 for every
  seed key, with `Cache-Control: public, max-age=86400` (0002 C9e) and no `x-amz-*` headers.
- AC3. `/media/` with a missing key answers 404; a `PUT`, `POST` or `DELETE` there is refused;
  `/media/` itself lists nothing.
- AC4. `/dev/catalog` and `/ui-kit` show the product photos as before, locally and in production.
- AC5. The web image built by CI contains no files of the demo catalog's photos.
- AC6. A deploy uploads the seed photos missing from the public bucket; a second deploy uploads
  nothing and changes no object that is already there.

### Private files

- AC7. An object of the private bucket fetched without a signature answers 403; `/media/<key>` of
  a private key answers 404.
- AC8. An admin `GET` of a user or a generation whose image file exists returns a link to it that
  answers 200 for 15 minutes and 403 after it expires (M9).
- AC9. An admin write of a user's or a generation's image key outside the owner's folder answers
  400 `VALIDATION` (M8).
- AC10. Deleting a user deletes every object in that user's folder; deleting a generation deletes
  its files (M11). With the storage unreachable, the deletion still answers success, and the files
  are gone within a minute of the storage coming back.
- AC11. The private bucket removes unfinished uploads after a day and has no other expiry rule (M4).

### Local stack and checks

- AC12. On a clean checkout, `docker compose up -d --wait` starts the emulator with both buckets
  and the seed photos; no internet access and no real keys are needed.
- AC13. `npm run verify` passes; the storage tests use a throwaway emulator, never the development
  one.
- AC14. The S3 keys appear in no image, no log line and no browser bundle.

## Owner actions (Claude cannot do them)

- Rent two Standard buckets in Timeweb Cloud (St Petersburg, 10 GB each, M5): a public one for the
  catalog media and a private one for users' files. Check the prices in the panel first: the
  tariff page contradicts itself.
- Create one access key for the api (M10) and put it into GitHub (Environment `production`);
  never into the chat.

## Assumptions

- Timeweb's storage speaks the S3 API (endpoint `s3.twcstorage.ru`, region `ru-1`), signs links to
  objects of private buckets, and filters lifecycle rules by key prefix only, not by tags.
- 10 GB per bucket last the demo: the catalog is 3.2 MB now and about 150 MB at 1,000 products; a
  generation (photo and result) is about 0.6 MB as WebP, so about 2 GB a year at ten a day (M5).
  When a bucket fills, Timeweb moves it to a larger tier.
- 100 GB of outgoing traffic a month are free; nginx's cache keeps repeat requests off the bucket.
