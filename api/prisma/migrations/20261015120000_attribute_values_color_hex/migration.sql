-- A swatch colour per attribute value, `#RRGGBB` or NULL (spec 0009, K12): the catalog's colour
-- filter draws each value's swatch from it. Nullable and read by no earlier release, so the
-- running copy keeps working while it is added.

-- AlterTable
ALTER TABLE "attribute_values" ADD COLUMN "color_hex" VARCHAR(7);

-- AddCheck
ALTER TABLE "attribute_values"
    ADD CONSTRAINT "attribute_values_color_hex_check" CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$');

-- The ten colours of the demo catalog (api/src/seed/catalog.data.ts, the kit's swatch tokens). The
-- seed never changes an existing row (spec 0004 E29), so the rows it loaded earlier get their
-- colour here. Matched by attribute name and value: a missing row is skipped, so this runs on any
-- database.
UPDATE "attribute_values" AS av
SET "color_hex" = c.hex
FROM "attributes" AS a,
    (VALUES
        ('чёрный', '#000000'),
        ('белый', '#FFFFFF'),
        ('синий', '#3972FC'),
        ('голубой', '#8BCDFF'),
        ('бежевый', '#DFBD93'),
        ('зелёный', '#3DB801'),
        ('серый', '#B6B6B6'),
        ('коричневый', '#743D02'),
        ('жёлтый', '#FFEC1C'),
        ('оранжевый', '#FF7A01')
    ) AS c (value, hex)
WHERE a.id = av.attribute_id
    AND a.name = 'Цвет'
    AND av.value = c.value;
