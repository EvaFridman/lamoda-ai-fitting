-- The photo consents kept with the user (spec 0023 plan §3.1, Y1): the time of the first upload's
-- consents and the version of their text. Additive: both nullable, so the previous release keeps
-- reading and writing users without them.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "photo_consent_at" TIMESTAMPTZ(3),
ADD COLUMN     "photo_consent_version" SMALLINT;

-- AddCheck: both or neither, and a version from 1.
ALTER TABLE "users"
    ADD CONSTRAINT "users_photo_consent_check" CHECK (
        (photo_consent_at IS NULL AND photo_consent_version IS NULL)
        OR (
            photo_consent_at IS NOT NULL
            AND photo_consent_version IS NOT NULL
            AND photo_consent_version >= 1
        )
    );
