-- CreateEnum
CREATE TYPE "gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "generation_status" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "phone" VARCHAR(12) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "last_name" VARCHAR(50),
    "patronymic" VARCHAR(50),
    "date_of_birth" DATE,
    "gender" "gender",
    "fitting_profile_image_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "article" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "rating" DECIMAL(2,1),
    "price" DECIMAL(10,2) NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "brand_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "product_id" UUID NOT NULL,
    "image_key" VARCHAR(255) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "product_id" UUID NOT NULL,
    "size" VARCHAR(20) NOT NULL,
    "stock" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attributes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_values" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "attribute_id" UUID NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attribute_values" (
    "product_id" UUID NOT NULL,
    "attribute_value_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY ("product_id","attribute_value_id")
);

-- CreateTable
CREATE TABLE "fitting_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fitting_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "session_id" UUID NOT NULL,
    "user_image_key" VARCHAR(255) NOT NULL,
    "result_image_key" VARCHAR(255),
    "status" "generation_status" NOT NULL,
    "ai_provider" VARCHAR(50) NOT NULL,
    "ai_model" VARCHAR(50) NOT NULL,
    "error_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_products" (
    "generation_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "generation_products_pkey" PRIMARY KEY ("generation_id","product_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_article_key" ON "products"("article");

-- CreateIndex
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variations_product_id_size_key" ON "product_variations"("product_id", "size");

-- CreateIndex
CREATE UNIQUE INDEX "attributes_name_key" ON "attributes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_values_attribute_id_value_key" ON "attribute_values"("attribute_id", "value");

-- CreateIndex
CREATE INDEX "product_attribute_values_attribute_value_id_idx" ON "product_attribute_values"("attribute_value_id");

-- CreateIndex
CREATE INDEX "fitting_sessions_user_id_idx" ON "fitting_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "fitting_sessions_user_id_key" ON "fitting_sessions"("user_id") WHERE (is_active);

-- CreateIndex
CREATE INDEX "ai_generations_session_id_idx" ON "ai_generations"("session_id");

-- CreateIndex
CREATE INDEX "generation_products_product_id_idx" ON "generation_products"("product_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variations" ADD CONSTRAINT "product_variations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_value_id_fkey" FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitting_sessions" ADD CONSTRAINT "fitting_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "fitting_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_products" ADD CONSTRAINT "generation_products_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "ai_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_products" ADD CONSTRAINT "generation_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (spec 0002, C12), added by hand: Prisma does not model them and ignores them
-- when it compares the schema with the database. Named <table>_<column>_check, or
-- <table>_<rule>_check when a rule spans columns. A NULL in a nullable column passes.
-- Regexes use ASCII and explicit Cyrillic ranges only, so they do not depend on the locale.

-- AddCheck
ALTER TABLE "users"
    ADD CONSTRAINT "users_phone_check" CHECK (phone ~ '^\+79[0-9]{9}$'),
    ADD CONSTRAINT "users_email_check" CHECK (
        email = lower(email)
        AND char_length(email) <= 254
        AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    ),
    ADD CONSTRAINT "users_first_name_check" CHECK (
        char_length(first_name) BETWEEN 2 AND 50
        AND first_name ~ '^[A-Za-zА-ЯЁа-яё]+([ ''-][A-Za-zА-ЯЁа-яё]+)*$'
    ),
    ADD CONSTRAINT "users_last_name_check" CHECK (
        char_length(last_name) BETWEEN 2 AND 50
        AND last_name ~ '^[A-Za-zА-ЯЁа-яё]+([ ''-][A-Za-zА-ЯЁа-яё]+)*$'
    ),
    ADD CONSTRAINT "users_patronymic_check" CHECK (
        char_length(patronymic) BETWEEN 2 AND 50
        AND patronymic ~ '^[A-Za-zА-ЯЁа-яё]+([ ''-][A-Za-zА-ЯЁа-яё]+)*$'
    ),
    -- CURRENT_DATE is evaluated when a row is written: a valid date stays valid.
    ADD CONSTRAINT "users_date_of_birth_check" CHECK (
        date_of_birth >= DATE '1900-01-01' AND date_of_birth <= CURRENT_DATE
    ),
    ADD CONSTRAINT "users_fitting_profile_image_key_check" CHECK (
        fitting_profile_image_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$'
        AND strpos(fitting_profile_image_key, '..') = 0
    );

-- AddCheck
ALTER TABLE "categories"
    ADD CONSTRAINT "categories_name_check" CHECK (name <> '' AND name = btrim(name)),
    ADD CONSTRAINT "categories_slug_check" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    ADD CONSTRAINT "categories_sort_order_check" CHECK (sort_order >= 0);

-- AddCheck
ALTER TABLE "brands"
    ADD CONSTRAINT "brands_name_check" CHECK (name <> '' AND name = btrim(name));

-- AddCheck
ALTER TABLE "products"
    ADD CONSTRAINT "products_article_check" CHECK (article <> '' AND article = btrim(article)),
    ADD CONSTRAINT "products_name_check" CHECK (name <> '' AND name = btrim(name)),
    ADD CONSTRAINT "products_price_check" CHECK (price > 0),
    ADD CONSTRAINT "products_discount_check" CHECK (discount BETWEEN 0 AND 100),
    ADD CONSTRAINT "products_rating_check" CHECK (rating BETWEEN 0 AND 5);

-- AddCheck
ALTER TABLE "product_images"
    ADD CONSTRAINT "product_images_image_key_check" CHECK (
        image_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$'
        AND strpos(image_key, '..') = 0
    ),
    ADD CONSTRAINT "product_images_sort_order_check" CHECK (sort_order >= 0);

-- AddCheck
ALTER TABLE "product_variations"
    ADD CONSTRAINT "product_variations_size_check" CHECK (size <> '' AND size = btrim(size)),
    ADD CONSTRAINT "product_variations_stock_check" CHECK (stock >= 0);

-- AddCheck
ALTER TABLE "attributes"
    ADD CONSTRAINT "attributes_name_check" CHECK (name <> '' AND name = btrim(name));

-- AddCheck
ALTER TABLE "attribute_values"
    ADD CONSTRAINT "attribute_values_value_check" CHECK (value <> '' AND value = btrim(value));

-- AddCheck
ALTER TABLE "ai_generations"
    ADD CONSTRAINT "ai_generations_user_image_key_check" CHECK (
        user_image_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$'
        AND strpos(user_image_key, '..') = 0
    ),
    ADD CONSTRAINT "ai_generations_result_image_key_check" CHECK (
        result_image_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$'
        AND strpos(result_image_key, '..') = 0
    ),
    -- The length is the column type, varchar(1000) (C23).
    ADD CONSTRAINT "ai_generations_error_message_check" CHECK (error_message <> ''),
    ADD CONSTRAINT "ai_generations_status_check" CHECK (
        (status = 'completed' AND result_image_key IS NOT NULL AND error_message IS NULL)
        OR (status = 'failed' AND error_message IS NOT NULL)
        OR (status IN ('pending', 'processing') AND result_image_key IS NULL AND error_message IS NULL)
    );
