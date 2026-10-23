-- Fittings (spec 0019, plan §2): what a generation needs to be a user's fitting. Additive: the new
-- columns are nullable or have a default, so the previous release, which inserts rows without them
-- (its closed route), keeps working while it runs; `user_id` and `kind` become NOT NULL in a later
-- release. The CHECK rules live only here (schema.prisma does not model them);
-- common/errors/constraint-fields.ts names the field of each one.

-- CreateEnum
CREATE TYPE "fitting_kind" AS ENUM ('single', 'look');

-- CreateEnum
CREATE TYPE "fitting_failure" AS ENUM ('photo_dark', 'photo_not_full', 'photo_many_people', 'photo_child', 'photo_no_person', 'prompt_refused', 'model_timeout', 'moderation', 'provider_error');

-- AlterTable: `user_image_key` becomes nullable, a fitting references its photo instead (A24).
ALTER TABLE "ai_generations" ADD COLUMN     "counts_against_limit" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "failure_code" "fitting_failure",
ADD COLUMN     "fingerprint" CHAR(64),
ADD COLUMN     "finished_at" TIMESTAMPTZ(3),
ADD COLUMN     "kind" "fitting_kind",
ADD COLUMN     "parent_id" UUID,
ADD COLUMN     "photo_id" UUID,
ADD COLUMN     "prompt_text" VARCHAR(300),
ADD COLUMN     "provider_request_id" VARCHAR(100),
ADD COLUMN     "regeneration_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "started_at" TIMESTAMPTZ(3),
ADD COLUMN     "user_id" UUID,
ALTER COLUMN "user_image_key" DROP NOT NULL;

-- AlterTable
ALTER TABLE "generation_products" ADD COLUMN     "attribute_value_id" UUID,
ADD COLUMN     "slot" "outfit_slot";

-- The user of every existing generation is its session's (A23). Rows the previous release inserts
-- after this keep `user_id` NULL; only its closed route writes them.
UPDATE "ai_generations" AS g
SET "user_id" = s."user_id"
FROM "fitting_sessions" AS s
WHERE s."id" = g."session_id" AND g."user_id" IS NULL;

-- CreateIndex: the user's history, newest first.
CREATE INDEX "ai_generations_user_id_created_at_idx" ON "ai_generations"("user_id", "created_at" DESC);

-- CreateIndex: the repeat lookup (A7) of a completed generation by its fingerprint.
CREATE INDEX "ai_generations_user_id_fingerprint_idx" ON "ai_generations"("user_id", "fingerprint");

-- CreateIndex
CREATE INDEX "ai_generations_photo_id_idx" ON "ai_generations"("photo_id");

-- CreateIndex
CREATE INDEX "ai_generations_parent_id_idx" ON "ai_generations"("parent_id");

-- CreateIndex: one running generation per user and fingerprint (A32), as fitting_sessions_user_id_key
-- (0002 C21). Rows without a fingerprint (the closed route's) never conflict: NULLs are distinct.
CREATE UNIQUE INDEX "ai_generations_user_id_fingerprint_key" ON "ai_generations"("user_id", "fingerprint") WHERE (status IN ('pending', 'processing'));

-- CreateIndex
CREATE INDEX "generation_products_attribute_value_id_idx" ON "generation_products"("attribute_value_id");

-- CreateIndex: the targets of the owner keys below (A65).
CREATE UNIQUE INDEX "fitting_sessions_id_user_id_key" ON "fitting_sessions"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_photos_id_user_id_key" ON "user_photos"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_generations_id_user_id_key" ON "ai_generations"("id", "user_id");

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: the owner keys (A65). A generation's session, photo and parent are its user's, so
-- no write can try on someone else's photo or regenerate someone else's result, and the row's
-- `user_id` and its session's (whose folder holds its files) never differ. A row without `user_id`
-- (the previous release's) skips them (MATCH SIMPLE): `session_id` keeps its plain key, and the
-- CHECK below allows it no photo and no parent. An owner never changes: an update of a referenced
-- `(id, user_id)` fails (NO ACTION) instead of moving the generations to another user.
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_session_id_user_id_fkey" FOREIGN KEY ("session_id", "user_id") REFERENCES "fitting_sessions"("id", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey: deleting a photo keeps the results (A24) and their user: only `photo_id` is set to
-- NULL (PostgreSQL 15+; Prisma does not model the column list and reads this as its SET NULL).
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_photo_id_user_id_fkey" FOREIGN KEY ("photo_id", "user_id") REFERENCES "user_photos"("id", "user_id") ON DELETE SET NULL ("photo_id") ON UPDATE NO ACTION;

-- AddForeignKey: deleting a result keeps its regenerations, as the photo's key does.
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_parent_id_user_id_fkey" FOREIGN KEY ("parent_id", "user_id") REFERENCES "ai_generations"("id", "user_id") ON DELETE SET NULL ("parent_id") ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "generation_products" ADD CONSTRAINT "generation_products_attribute_value_id_fkey" FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheck: the status rule with the failure code (plan §2): `completed` has a result and neither
-- failure, `failed` has a code or a message, `pending` and `processing` have none of the three. The
-- previous release's rows and writes (a message on every failure, never a code) pass it.
ALTER TABLE "ai_generations"
    DROP CONSTRAINT "ai_generations_status_check",
    ADD CONSTRAINT "ai_generations_status_check" CHECK (
        (status = 'completed' AND result_image_key IS NOT NULL AND error_message IS NULL
            AND failure_code IS NULL)
        OR (status = 'failed' AND (failure_code IS NOT NULL OR error_message IS NOT NULL))
        OR (status IN ('pending', 'processing') AND result_image_key IS NULL
            AND error_message IS NULL AND failure_code IS NULL)
    ),
    -- sha256 in lower-case hex (A7, A32).
    ADD CONSTRAINT "ai_generations_fingerprint_check" CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    -- The text is stored trimmed of any white space, as String.prototype.trim does (A16), an empty
    -- one as NULL. `btrim` would strip spaces only and let a newline at either end through.
    ADD CONSTRAINT "ai_generations_prompt_text_check" CHECK (prompt_text ~ '^\S(.*\S)?$'),
    ADD CONSTRAINT "ai_generations_provider_request_id_check" CHECK (provider_request_id <> ''),
    -- A photo or a parent only with a user, whose owner keys then check them (A65).
    ADD CONSTRAINT "ai_generations_owner_check" CHECK (
        user_id IS NOT NULL OR (photo_id IS NULL AND parent_id IS NULL)
    ),
    -- A list, never NULL: Prisma makes every list nullable, the default fills a write without it.
    ADD CONSTRAINT "ai_generations_regeneration_reasons_check" CHECK (regeneration_reasons IS NOT NULL);
