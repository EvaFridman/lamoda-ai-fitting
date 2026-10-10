import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { ProductFilterQueryDto } from '../dto/product-filter-query.dto.js';

// The filters of the product list, parsed once (spec 0004 E13, E45). The list turns them into a
// Prisma `where`; the filter counts (T12) into SQL. A field left undefined does not filter, so a
// count can drop its own group.
export interface ProductFilter {
  categoryIds?: string[];
  brandIds?: string[];
  sizes?: string[];
  // One group per attribute: a product needs one value of every group (E13a).
  attributeGroups?: AttributeGroup[];
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  hasDiscount?: boolean;
}

export interface AttributeGroup {
  // null for a value id that does not exist: a group of its own that no product matches (E45).
  attributeId: string | null;
  valueIds: string[];
}

// The attribute of each chosen value that exists, in one query.
export async function loadValueAttributes(
  prisma: PrismaService,
  valueIds: readonly string[] | undefined,
): Promise<ReadonlyMap<string, string>> {
  if (valueIds === undefined || valueIds.length === 0) {
    return new Map();
  }
  const rows = await prisma.attributeValue.findMany({
    where: { id: { in: [...new Set(valueIds)] } },
    select: { id: true, attributeId: true },
  });
  return new Map(rows.map((row) => [row.id, row.attributeId]));
}

export function toProductFilter(
  query: ProductFilterQueryDto,
  valueAttributes: ReadonlyMap<string, string>,
): ProductFilter {
  const valueIds = uniqueIds(query.attributeValueId);
  return {
    categoryIds: uniqueIds(query.categoryId),
    brandIds: uniqueIds(query.brandId),
    sizes: unique(query.size),
    attributeGroups: valueIds && groupByAttribute(valueIds, valueAttributes),
    q: query.q,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    hasDiscount: query.hasDiscount,
  };
}

function groupByAttribute(
  valueIds: string[],
  valueAttributes: ReadonlyMap<string, string>,
): AttributeGroup[] {
  const groups = new Map<string, AttributeGroup>();
  const unknown: AttributeGroup[] = [];
  for (const valueId of valueIds) {
    const attributeId = valueAttributes.get(valueId);
    if (attributeId === undefined) {
      unknown.push({ attributeId: null, valueIds: [valueId] });
      continue;
    }
    const group = groups.get(attributeId);
    if (group === undefined) {
      groups.set(attributeId, { attributeId, valueIds: [valueId] });
    } else {
      group.valueIds.push(valueId);
    }
  }
  return [...groups.values(), ...unknown];
}

function unique(values: string[] | undefined): string[] | undefined {
  return values && [...new Set(values)];
}

// A uuid in any letter case is one value; the database returns ids in lower case, so the lookup of
// `valueAttributes` needs them so too.
function uniqueIds(values: string[] | undefined): string[] | undefined {
  return unique(values?.map((value) => value.toLowerCase()));
}

// `contains` becomes ILIKE with the text as is, so `%` and `_` would be wildcards. PostgreSQL's
// default LIKE escape is the backslash; escaping it too keeps a `\` in the text literal (E45).
export function escapeLike(text: string): string {
  return text.replaceAll(/[\\%_]/g, '\\$&');
}

// Filters AND together; the values of one filter OR (E45). A size counts only in stock (E13b).
export function toProductWhere(filter: ProductFilter): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  if (filter.categoryIds) {
    and.push({ categoryId: { in: filter.categoryIds } });
  }
  if (filter.brandIds) {
    and.push({ brandId: { in: filter.brandIds } });
  }
  if (filter.sizes) {
    and.push({ variations: { some: { size: { in: filter.sizes }, stock: { gt: 0 } } } });
  }
  for (const group of filter.attributeGroups ?? []) {
    and.push({ attributeValues: { some: { attributeValueId: { in: group.valueIds } } } });
  }
  if (filter.q !== undefined) {
    and.push({ name: { contains: escapeLike(filter.q), mode: 'insensitive' } });
  }
  if (filter.minPrice !== undefined) {
    and.push({ price: { gte: filter.minPrice } });
  }
  if (filter.maxPrice !== undefined) {
    and.push({ price: { lte: filter.maxPrice } });
  }
  if (filter.hasDiscount !== undefined) {
    and.push({ discount: filter.hasDiscount ? { gt: 0 } : { equals: 0 } });
  }
  return { AND: and };
}

// The same filters as `toProductWhere`, as a condition on `products p` for the filter counts. Every
// value is a parameter; lists go through `Prisma.join` (plan "Facets").
export function toProductSql(filter: ProductFilter): Prisma.Sql {
  const and: Prisma.Sql[] = [];
  if (filter.categoryIds) {
    and.push(Prisma.sql`p.category_id IN (${joinOrNull(filter.categoryIds)})`);
  }
  if (filter.brandIds) {
    and.push(Prisma.sql`p.brand_id IN (${joinOrNull(filter.brandIds)})`);
  }
  if (filter.sizes) {
    and.push(Prisma.sql`EXISTS (
      SELECT 1 FROM product_variations v
      WHERE v.product_id = p.id AND v.stock > 0 AND v.size IN (${joinOrNull(filter.sizes)}))`);
  }
  for (const group of filter.attributeGroups ?? []) {
    and.push(attributeGroupSql(group));
  }
  if (filter.q !== undefined) {
    and.push(Prisma.sql`p.name ILIKE '%' || ${escapeLike(filter.q)} || '%'`);
  }
  // As text, so the comparison stays exact in numeric.
  if (filter.minPrice !== undefined) {
    and.push(Prisma.sql`p.price >= ${String(filter.minPrice)}::numeric`);
  }
  if (filter.maxPrice !== undefined) {
    and.push(Prisma.sql`p.price <= ${String(filter.maxPrice)}::numeric`);
  }
  if (filter.hasDiscount !== undefined) {
    and.push(filter.hasDiscount ? Prisma.sql`p.discount > 0` : Prisma.sql`p.discount = 0`);
  }
  return and.length === 0 ? Prisma.sql`TRUE` : Prisma.join(and, ' AND ');
}

// A product with one of the group's values. A group of an unknown value matches none (E45): FALSE,
// so 50 unknown ids do not add 50 subqueries to every count.
export function attributeGroupSql(group: AttributeGroup): Prisma.Sql {
  if (group.attributeId === null) {
    return Prisma.sql`FALSE`;
  }
  return Prisma.sql`EXISTS (
    SELECT 1 FROM product_attribute_values pav
    WHERE pav.product_id = p.id AND pav.attribute_value_id IN (${joinOrNull(group.valueIds)}))`;
}

// `Prisma.join` throws on an empty list; `IN (NULL)` matches nothing, as Prisma's `in: []`.
export function joinOrNull(values: readonly string[]): Prisma.Sql {
  return values.length === 0 ? Prisma.sql`NULL` : Prisma.join(values);
}
