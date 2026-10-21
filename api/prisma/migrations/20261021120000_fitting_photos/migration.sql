-- Fitting photos (spec 0019, plan §2): the slot of a category (A18), users' photos (A24, A31), the
-- month's spend of the fitting limit (A20) and the outbox of file deletions (A38). Additive: a
-- nullable column, two enums and three tables that no earlier release reads, so the running copy
-- keeps working while it runs. The CHECK rules live only here (schema.prisma does not model them);
-- common/errors/constraint-fields.ts names the field of each one.

-- CreateEnum
CREATE TYPE "outfit_slot" AS ENUM ('top', 'bottom', 'outerwear', 'shoes', 'accessory');

-- CreateEnum
CREATE TYPE "file_deletion_kind" AS ENUM ('user', 'session', 'generation', 'photo');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "slot" "outfit_slot";

-- The slots of the demo catalog (api/src/seed/catalog.data.ts, A18). The seed never changes an
-- existing row (spec 0004 E29), so the rows it loaded earlier get their slot here; the seed sets
-- the same for a row it adds. Matched by slug: a missing row is skipped, so this runs on any
-- database.
UPDATE "categories" AS c
SET "slot" = s.slot::"outfit_slot"
FROM (VALUES
        ('t-shirts', 'top'),
        ('hoodies', 'top'),
        ('dresses', 'top'),
        ('jeans', 'bottom'),
        ('outerwear', 'outerwear'),
        ('shoes', 'shoes')
    ) AS s (slug, slot)
WHERE c.slug = s.slug;

-- CreateTable
CREATE TABLE "user_photos" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "image_key" VARCHAR(255) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "transient" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitting_quota" (
    "user_id" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fitting_quota_pkey" PRIMARY KEY ("user_id","month")
);

-- CreateTable
CREATE TABLE "file_deletions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "kind" "file_deletion_kind" NOT NULL,
    "row_id" UUID NOT NULL,
    "prefixes" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),

    CONSTRAINT "file_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_photos_user_id_idx" ON "user_photos"("user_id");

-- CreateIndex: one default photo per user (A31), as fitting_sessions_user_id_key (0002 C21).
CREATE UNIQUE INDEX "user_photos_user_id_key" ON "user_photos"("user_id") WHERE (is_default);

-- CreateIndex: one deletion per row; the workflow id is built from the same pair.
CREATE UNIQUE INDEX "file_deletions_kind_row_id_key" ON "file_deletions"("kind", "row_id");

-- CreateIndex: the rows the housekeeping schedule starts, oldest first.
CREATE INDEX "file_deletions_created_at_idx" ON "file_deletions"("created_at") WHERE (started_at IS NULL);

-- AddForeignKey
ALTER TABLE "user_photos" ADD CONSTRAINT "user_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitting_quota" ADD CONSTRAINT "fitting_quota_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheck: the key rule of the image columns (0002 C22), the key inside the row owner's folder
-- (spec 0011 M7: a photo is a `keep/users/<userId>/…` key, so no route can store another user's
-- or a catalog key here), and a real picture.
ALTER TABLE "user_photos"
    ADD CONSTRAINT "user_photos_image_key_check" CHECK (
        image_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$'
        AND strpos(image_key, '..') = 0
        AND image_key LIKE 'keep/users/' || user_id::text || '/%'
    ),
    ADD CONSTRAINT "user_photos_width_check" CHECK (width > 0),
    ADD CONSTRAINT "user_photos_height_check" CHECK (height > 0);

-- AddCheck: `YYYY-MM`, and a spend that a refund never takes below zero (A20).
ALTER TABLE "fitting_quota"
    ADD CONSTRAINT "fitting_quota_month_check" CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    ADD CONSTRAINT "fitting_quota_used_check" CHECK (used >= 0);

-- AddCheck: a deletion names at least one folder (an empty one would start nothing). The column is
-- nullable, as Prisma makes every list, and a `create` without the list writes NULL: refused too.
ALTER TABLE "file_deletions"
    ADD CONSTRAINT "file_deletions_prefixes_check" CHECK (prefixes IS NOT NULL AND cardinality(prefixes) > 0);
