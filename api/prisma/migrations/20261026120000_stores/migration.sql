-- Lamoda Sport's stores (spec 0022 plan §2.1, X1, X2), filled only by the seed. Additive: a table
-- no earlier release reads, so the running copy keeps working while it runs.
-- common/errors/constraint-fields.ts names the field of each constraint.

-- CreateEnum
CREATE TYPE "store_type" AS ENUM ('sport', 'urban', 'outlet');

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "store_type" NOT NULL,
    "city" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "house" TEXT NOT NULL,
    "mall" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "metro_stations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "work_time" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "phones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stores_position_key" ON "stores"("position");

-- Lamoda's code is the seed's natural key; text is trimmed and not empty (as
-- ai_generations_prompt_text_check). Prisma writes list columns as nullable: an empty list, not
-- NULL, is a store without a metro station or a phone (X20).
ALTER TABLE "stores"
    ADD CONSTRAINT "stores_code_check" CHECK (code ~ '^[a-z0-9]{4}$'),
    ADD CONSTRAINT "stores_position_check" CHECK (position >= 0),
    ADD CONSTRAINT "stores_name_check" CHECK (name ~ '^\S(.*\S)?$'),
    ADD CONSTRAINT "stores_city_check" CHECK (city ~ '^\S(.*\S)?$'),
    ADD CONSTRAINT "stores_street_check" CHECK (street ~ '^\S(.*\S)?$'),
    ADD CONSTRAINT "stores_house_check" CHECK (house ~ '^\S(.*\S)?$'),
    ADD CONSTRAINT "stores_mall_check" CHECK (mall ~ '^\S(.*\S)?$'),
    ADD CONSTRAINT "stores_latitude_check" CHECK (latitude BETWEEN -90 AND 90),
    ADD CONSTRAINT "stores_longitude_check" CHECK (longitude BETWEEN -180 AND 180),
    ADD CONSTRAINT "stores_metro_stations_check" CHECK (metro_stations IS NOT NULL),
    ADD CONSTRAINT "stores_work_time_check" CHECK (work_time ~ '^\S(.*\S)?$'),
    ADD CONSTRAINT "stores_description_check" CHECK (description ~ '^\S(.*\S)?$'),
    ADD CONSTRAINT "stores_phones_check" CHECK (phones IS NOT NULL);
