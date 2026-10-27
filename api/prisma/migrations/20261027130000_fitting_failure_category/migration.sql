-- A moderation refusal's coarse category and stage kept with the fitting (spec 0023 plan §3.5,
-- Y2), so the history and a reopened result tell why. Additive: both nullable, so the previous
-- release keeps ending fittings without them; its rows and the older ones have neither.

-- CreateEnum
CREATE TYPE "safety_category" AS ENUM ('sexual', 'minors', 'violence', 'self_harm', 'hate', 'illicit', 'unknown');

-- CreateEnum
CREATE TYPE "moderation_stage" AS ENUM ('input', 'output');

-- AlterTable
ALTER TABLE "ai_generations" ADD COLUMN     "failure_category" "safety_category",
ADD COLUMN     "failure_stage" "moderation_stage";

-- AddCheck: both or neither, and set only on a fitting that failed by moderation.
ALTER TABLE "ai_generations"
    ADD CONSTRAINT "ai_generations_failure_safety_check" CHECK (
        (failure_category IS NULL AND failure_stage IS NULL)
        OR (
            failure_category IS NOT NULL
            AND failure_stage IS NOT NULL
            AND failure_code IS NOT NULL
            AND failure_code = 'moderation'
        )
    );
