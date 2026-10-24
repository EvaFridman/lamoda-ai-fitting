-- A regeneration's own text and the free regeneration's flag (spec 0019 A70). Additive: both have
-- a default or are nullable, so the previous release keeps inserting rows without them.

-- AlterTable: `comment` is a regeneration's comment (A16, 300 characters); `prompt_text` holds the
-- wishes on every row. `free_regeneration_used` is set on a result when its free regeneration (A6)
-- starts and cleared when that one fails, so deleting the regeneration gives nothing back.
ALTER TABLE "ai_generations" ADD COLUMN     "comment" VARCHAR(300),
ADD COLUMN     "free_regeneration_used" BOOLEAN NOT NULL DEFAULT false;

-- AddCheck: trimmed of any white space and not empty, as `prompt_text` (A16).
ALTER TABLE "ai_generations"
    ADD CONSTRAINT "ai_generations_comment_check" CHECK (comment ~ '^\S(.*\S)?$');
