-- Word search over the product list and an index for each of its sorts (spec 0014, O14, O17; plan
-- §2.1, §2.2, §2.4). Read by no earlier release: while the migration runs, the running copy waits
-- on `products` (the table is small), then works as before, and the triggers keep the vector right
-- on its writes to products, brands and categories. Every function pins its search_path.

-- Behind a long query of the running release, fail and stop the deploy instead of queueing every
-- read of products behind this migration (spec 0014, O51).
SET lock_timeout = '5s';

-- The vector of one product: its name (weight A), its brand's and its category's names. The one
-- place it is built: the triggers and the fill below call it.
CREATE FUNCTION "product_search_vector"(product_name TEXT, brand UUID, category UUID)
RETURNS tsvector
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT setweight(to_tsvector('russian', product_name), 'A')
        || to_tsvector('russian', coalesce((SELECT name FROM brands WHERE id = brand), ''))
        || to_tsvector('russian', coalesce((SELECT name FROM categories WHERE id = category), ''))
$$;

-- AlterTable
ALTER TABLE "products" ADD COLUMN "search_vector" tsvector NOT NULL DEFAULT '';

UPDATE "products" SET "search_vector" = product_search_vector(name, brand_id, category_id);

-- A generated column cannot read other tables, hence the triggers. A product's own row sets its
-- vector before it is written.
CREATE FUNCTION "products_set_search_vector"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- A product joining a brand or a category waits for a rename of it in progress: else it would
    -- read the old name, and the rename's refresh below would not see the uncommitted product. A
    -- product that stays only changes its name: a rename's refresh waits for it and rebuilds it.
    -- This holds for writes in READ COMMITTED (under REPEATABLE READ the lock fails with 40001
    -- instead). A transaction that renames both a brand and a category renames the brand first,
    -- the order a product takes the locks in, else it may deadlock with a product write.
    IF TG_OP = 'INSERT' OR NEW.brand_id IS DISTINCT FROM OLD.brand_id THEN
        PERFORM 1 FROM brands WHERE id = NEW.brand_id FOR SHARE;
    END IF;
    IF TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
        PERFORM 1 FROM categories WHERE id = NEW.category_id FOR SHARE;
    END IF;
    NEW.search_vector := product_search_vector(NEW.name, NEW.brand_id, NEW.category_id);
    RETURN NEW;
END
$$;

CREATE TRIGGER "products_search_vector"
    BEFORE INSERT OR UPDATE OF name, brand_id, category_id ON "products"
    FOR EACH ROW EXECUTE FUNCTION products_set_search_vector();

-- A renamed brand or category refreshes its products' vectors.
CREATE FUNCTION "brands_refresh_search_vector"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    UPDATE products
    SET search_vector = product_search_vector(name, brand_id, category_id)
    WHERE brand_id = NEW.id;
    RETURN NULL;
END
$$;

CREATE TRIGGER "brands_search_vector"
    AFTER UPDATE OF name ON "brands"
    FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
    EXECUTE FUNCTION brands_refresh_search_vector();

CREATE FUNCTION "categories_refresh_search_vector"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    UPDATE products
    SET search_vector = product_search_vector(name, brand_id, category_id)
    WHERE category_id = NEW.id;
    RETURN NULL;
END
$$;

CREATE TRIGGER "categories_search_vector"
    AFTER UPDATE OF name ON "categories"
    FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
    EXECUTE FUNCTION categories_refresh_search_vector();

-- CreateIndex: the search, and a `q` equal to an article in any case.
CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("search_vector");
CREATE INDEX "products_article_lower_idx" ON "products" (lower("article"));

-- CreateIndex: one per sort, each ending with the `id desc` tie-break. The price sorts need one
-- each: with `id desc` after both, one index scanned both ways cannot serve them. Not CONCURRENTLY:
-- a Prisma migration runs in a transaction, and the table is small.
CREATE INDEX "products_created_at_id_idx" ON "products" ("created_at" DESC, "id" DESC);
CREATE INDEX "products_price_asc_id_idx" ON "products" ("price" ASC, "id" DESC);
CREATE INDEX "products_price_desc_id_idx" ON "products" ("price" DESC, "id" DESC);
CREATE INDEX "products_discount_id_idx" ON "products" ("discount" DESC, "id" DESC);
CREATE INDEX "products_rating_id_idx" ON "products" ("rating" DESC NULLS LAST, "id" DESC);

RESET lock_timeout;
