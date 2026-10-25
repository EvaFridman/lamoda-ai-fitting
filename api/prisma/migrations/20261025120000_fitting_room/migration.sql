-- The fitting room (spec 0019, plan §2, A12, A86): one item per user and slot. Additive: a table no
-- earlier release reads, so the running copy keeps working while it runs. It goes with the user
-- (AC28) and with the product; common/errors/constraint-fields.ts names the field of each key.

-- CreateTable
CREATE TABLE "fitting_room_items" (
    "user_id" UUID NOT NULL,
    "slot" "outfit_slot" NOT NULL,
    "product_id" UUID NOT NULL,
    "attribute_value_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fitting_room_items_pkey" PRIMARY KEY ("user_id","slot")
);

-- CreateIndex
CREATE INDEX "fitting_room_items_product_id_attribute_value_id_idx" ON "fitting_room_items"("product_id", "attribute_value_id");

-- AddForeignKey
ALTER TABLE "fitting_room_items" ADD CONSTRAINT "fitting_room_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitting_room_items" ADD CONSTRAINT "fitting_room_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The colour is one of the product's own values: the key references the product's link, so a
-- colour of another product is refused, and only `attribute_value_id` is set to NULL when the link
-- goes (PostgreSQL 15+; Prisma does not model the column list and reads this as its SET NULL).
-- AddForeignKey
ALTER TABLE "fitting_room_items" ADD CONSTRAINT "fitting_room_items_product_id_attribute_value_id_fkey" FOREIGN KEY ("product_id", "attribute_value_id") REFERENCES "product_attribute_values"("product_id", "attribute_value_id") ON DELETE SET NULL ("attribute_value_id") ON UPDATE NO ACTION;
