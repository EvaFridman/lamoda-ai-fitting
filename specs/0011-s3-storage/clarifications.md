# 0011 S3 storage: clarifications

Status: open (2026-10-16).

The owner's decisions for this spec. Ids `M1`, `M2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-16.

## Storage

- **M1. Two buckets in Timeweb Cloud.** A public bucket holds the catalog media (today the product
  photos); a private one holds users' photos and generation results, which no route writes yet.
  One bucket with per-object access was rejected: one wrong permission would open users' photos,
  and the two kinds of data need different access, cross-origin and expiry rules.
- **M2. Only the media that exist move.** Issue #43 lists product photos, promo videos, category and
  brand images; only product photos exist. No column for category or brand images or videos is
  added until a page needs one.
- **M3. Public media through nginx.** nginx serves `/media/<key>` from the public bucket on the
  site's own origin, so `MEDIA_BASE_URL` in production stays `https://lamoda-ai-fitting.ru/media/`
  and the browser needs no cross-origin rules. Links straight to the bucket were rejected: another
  origin for CSP and videos, and every request counts against the bucket's traffic.
- **M4. Users' files have no time limit.** They are deleted by hand or together with their user or
  generation. Lifecycle removes only unfinished uploads (after a day). A retention period can be
  added later as a key prefix (M7).
- **M5. Size.** Two Standard buckets of 10 GB, the smallest tier; "cold" storage is not used (slow,
  and the data are not an archive). Estimate: catalog 3.2 MB now, about 150 MB at 1,000 products;
  a generation's photo and result about 0.6 MB as WebP (3–5 MB as uploaded), about 2 GB a year at
  ten generations a day. The upload spec re-encodes photos to WebP.
- **M6. Database backups are spec 0012.** Issue #42 (daily, kept a week) goes into its own spec
  right after this one: a bucket of its own (cold class, a 7-day expiry rule), a key that can only
  write there, an encrypted dump and a restore check. Putting dumps into the private bucket was
  rejected: the api's key would read and delete them, and their expiry is the opposite of M4.
- **M7. Key layout.** Timeweb's lifecycle rules match key prefixes only, so a key's prefix says how
  long it lives.
  - Public: `seed/products/<article>/<n>.webp` (as today), `catalog/products/<productId>/<uuid>.webp`
    for photos added later.
  - Private: `users/<userId>/profile/<uuid>.webp`,
    `users/<userId>/generations/<generationId>/input.webp` and `…/result.webp`, `tmp/<uuid>` for
    unfinished uploads.
  - The owner's user id is in the key and in the object's metadata. The server names every private
    key; a key sent by a client could point at another user's file (backlog "File storage").
  - Keys follow 0002 C22.

## Private files

- **M8. Keys outside the owner's folder are refused.** Admin writes of `fittingProfileImageKey`,
  `userImageKey` and `resultImageKey` answer 400 `VALIDATION` unless the key lies in
  `users/<userId>/` of the row's owner (the user, or the generation's session's user). Otherwise a
  signed link in a response could lead to another user's file, and deleting a generation could
  delete another user's files. Leaving them free until upload exists was rejected.
- **M9. Signed links live 15 minutes.** Long enough for a page to load the photo; a forwarded link
  stops working soon. The lifetime comes from the environment. One hour (Timeweb's panel) and five
  minutes were rejected.
- **M10. One access key for the api.** One key reaches both buckets; nginx reads the public bucket
  without a key. One secret, one rotation. Database backups (M6) get a key of their own. A key per
  bucket was rejected as twice the setup for little gain while only the api holds it.
- **M11. Files are deleted reliably through Temporal.** Deleting a user or a generation starts a
  workflow that deletes its files and retries until it succeeds, so no files are left behind. A
  manual cleanup script and a daily cleanup schedule were rejected. This is the first code that
  starts workflows, so it owes the backlog item "Retries of the shared connection at shutdown".

## Open questions

- Q1. The local and CI emulator. MinIO was archived in April 2026; candidates are SeaweedFS,
  Garage, S3Proxy and RustFS (alpha). Checked in the plan against signed links, multipart uploads
  and lifecycle rules, then the owner chooses.
- Q3. Where the seed photos live once they leave `web/public/media`, and what uploads them: a
  deploy step or the api's seed. Proposed in the plan.
