-- When the user first opened a completed result (spec 0024 plan §3.2, Z18): the header's badge
-- counts the completed fittings without it. Additive: nullable, so the previous release keeps
-- writing rows without it, and the ones it completes meanwhile count as unseen.

-- Behind a long query of the running release, fail and stop the deploy instead of queueing every
-- read and write of ai_generations behind this migration (spec 0014, O51).
SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "ai_generations" ADD COLUMN     "seen_at" TIMESTAMPTZ(3);

-- The results finished before the badge existed are not news: they count as seen when they
-- finished, so the first load after the release shows no badge for them.
UPDATE "ai_generations" SET "seen_at" = COALESCE("finished_at", "updated_at") WHERE "status" = 'completed';

-- CreateIndex: the count of `GET /me/fitting-quota`, read on every signed-in page load.
CREATE INDEX "ai_generations_unseen_idx" ON "ai_generations"("user_id") WHERE ((status = 'completed'::generation_status) AND (seen_at IS NULL) AND (kind IS NOT NULL));

RESET lock_timeout;
