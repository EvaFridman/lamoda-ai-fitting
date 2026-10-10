import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type {
  FacetAttributeDto,
  FacetBrandDto,
  FacetCategoryDto,
  FacetSizeDto,
  ProductFacetsDto,
} from '../dto/product-facets-response.dto.js';
import {
  attributeGroupSql,
  joinOrNull,
  type ProductFilter,
  toProductSql,
} from './product-filter.js';

// The filter counts (spec 0004 E16, E46; plan "Facets"). Each count runs with the filters minus its
// own group, so choosing one colour keeps the other colours' counts. A value joins the products
// through a LEFT JOIN whose condition holds the filters: a value no product matches counts 0 and
// is kept only when chosen.
export async function countFacets(
  prisma: PrismaService,
  filter: ProductFilter,
): Promise<ProductFacetsDto> {
  const [total, discounted, price, categories, brands, sizes, attributes] = await Promise.all([
    countProducts(prisma, toProductSql(filter)),
    countProducts(
      prisma,
      toProductSql({ ...filter, hasDiscount: undefined }),
      Prisma.sql`p.discount > 0`,
    ),
    priceRange(prisma, filter),
    countCategories(prisma, filter),
    countBrands(prisma, filter),
    countSizes(prisma, filter),
    countAttributes(prisma, filter),
  ]);
  return { total, discounted, price, categories, brands, sizes, attributes };
}

async function countProducts(
  prisma: PrismaService,
  where: Prisma.Sql,
  extra: Prisma.Sql = Prisma.sql`TRUE`,
): Promise<number> {
  const [row] = await prisma.$queryRaw<[{ count: number }]>`
    SELECT count(DISTINCT p.id)::int AS count FROM products p WHERE ${where} AND ${extra}`;
  return row.count;
}

async function priceRange(
  prisma: PrismaService,
  filter: ProductFilter,
): Promise<ProductFacetsDto['price']> {
  const where = toProductSql({ ...filter, minPrice: undefined, maxPrice: undefined });
  // Decimal(10, 2) fits a float8 exactly enough for JSON (spec 0004 assumptions).
  const [row] = await prisma.$queryRaw<[{ min: number | null; max: number | null }]>`
    SELECT min(p.price)::float8 AS min, max(p.price)::float8 AS max FROM products p WHERE ${where}`;
  return row.min === null || row.max === null ? null : { min: row.min, max: row.max };
}

function countCategories(
  prisma: PrismaService,
  filter: ProductFilter,
): Promise<FacetCategoryDto[]> {
  const where = toProductSql({ ...filter, categoryIds: undefined });
  return prisma.$queryRaw<FacetCategoryDto[]>`
    SELECT c.id, c.name, count(DISTINCT p.id)::int AS count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND ${where}
    GROUP BY c.id
    HAVING count(DISTINCT p.id) > 0 OR c.id IN (${joinOrNull(filter.categoryIds ?? [])})
    ORDER BY c.sort_order, c.name, c.id`;
}

function countBrands(prisma: PrismaService, filter: ProductFilter): Promise<FacetBrandDto[]> {
  const where = toProductSql({ ...filter, brandIds: undefined });
  return prisma.$queryRaw<FacetBrandDto[]>`
    SELECT b.id, b.name, count(DISTINCT p.id)::int AS count
    FROM brands b
    LEFT JOIN products p ON p.brand_id = b.id AND ${where}
    GROUP BY b.id
    HAVING count(DISTINCT p.id) > 0 OR b.id IN (${joinOrNull(filter.brandIds ?? [])})
    ORDER BY b.name, b.id`;
}

// Sizes are text in the variations, so a chosen size no product has in stock is added by VALUES.
function countSizes(prisma: PrismaService, filter: ProductFilter): Promise<FacetSizeDto[]> {
  const where = toProductSql({ ...filter, sizes: undefined });
  const chosen = filter.sizes ?? [];
  const chosenRows =
    chosen.length === 0
      ? Prisma.empty
      : Prisma.sql`UNION VALUES ${Prisma.join(chosen.map((size) => Prisma.sql`(${size})`))}`;
  return prisma.$queryRaw<FacetSizeDto[]>`
    SELECT s.size, count(DISTINCT p.id)::int AS count
    FROM (SELECT size FROM product_variations WHERE stock > 0 ${chosenRows}) s (size)
    LEFT JOIN product_variations v ON v.size = s.size AND v.stock > 0
    LEFT JOIN products p ON p.id = v.product_id AND ${where}
    GROUP BY s.size
    HAVING count(DISTINCT p.id) > 0 OR s.size IN (${joinOrNull(chosen)})
    ORDER BY s.size`;
}

interface AttributeValueCountRow {
  attributeId: string;
  attributeName: string;
  id: string;
  value: string;
  count: number;
}

// One query for every attribute: a value's count drops only its own attribute's group (E13a). The
// group of an unknown value (attributeId null) is never dropped, so it empties every count (E45).
async function countAttributes(
  prisma: PrismaService,
  filter: ProductFilter,
): Promise<FacetAttributeDto[]> {
  const groups = filter.attributeGroups ?? [];
  const where = Prisma.join(
    [
      toProductSql({ ...filter, attributeGroups: undefined }),
      ...groups.map(
        (group) =>
          Prisma.sql`(av.attribute_id IS NOT DISTINCT FROM ${group.attributeId}::uuid OR ${attributeGroupSql(group)})`,
      ),
    ],
    ' AND ',
  );
  const chosen = groups.flatMap((group) => group.valueIds);
  const rows = await prisma.$queryRaw<AttributeValueCountRow[]>`
    SELECT a.id AS "attributeId", a.name AS "attributeName", av.id, av.value,
      count(DISTINCT p.id)::int AS count
    FROM attribute_values av
    JOIN attributes a ON a.id = av.attribute_id
    LEFT JOIN product_attribute_values link ON link.attribute_value_id = av.id
    LEFT JOIN products p ON p.id = link.product_id AND ${where}
    GROUP BY a.id, av.id
    HAVING count(DISTINCT p.id) > 0 OR av.id IN (${joinOrNull(chosen)})
    ORDER BY a.name, a.id, av.value, av.id`;
  const attributes: FacetAttributeDto[] = [];
  for (const row of rows) {
    let attribute = attributes.at(-1);
    if (attribute?.id !== row.attributeId) {
      attribute = { id: row.attributeId, name: row.attributeName, values: [] };
      attributes.push(attribute);
    }
    attribute.values.push({ id: row.id, value: row.value, count: row.count });
  }
  return attributes;
}
