import { Prisma } from '../../generated/prisma/client.js';
import type { ProductFilterQueryDto } from '../dto/product-filter-query.dto.js';

// The filters of the product list, parsed once (spec 0004 E13, E45). The list and the filter counts
// turn them into SQL (`toProductSql`). A field left undefined does not filter, so a count can drop
// its own group.
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

// The attribute of each chosen value that exists, in one query; the client or a transaction's.
export async function loadValueAttributes(
  prisma: Prisma.TransactionClient,
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

// The words of a search, lower case: runs of letters and digits, anything else separates them (spec
// 0014 plan §2.1). Only these characters reach `to_tsquery`, so no tsquery syntax gets in. NFC
// first, so a letter typed as a base and a combining mark ("й" pasted from macOS) stays one letter.
export function searchTokens(q: string): string[] {
  return (
    q
      .normalize('NFC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

// The last word is a beginning only from this many characters (O53): one would match nearly every
// word in the index.
export const MIN_PREFIX_LENGTH = 2;

// Every word as a Russian lexeme, the last one as a beginning (O14): "плат" finds "платье". Stop
// words drop out, the last one too (O52). The article, case ignored, finds its product (the index on
// `lower(article)`). A `q` with no word finds nothing.
export function searchSql(q: string): Prisma.Sql {
  const tokens = searchTokens(q);
  if (tokens.length === 0) {
    return Prisma.sql`FALSE`;
  }
  const last = tokens.at(-1) ?? '';
  const prefix = [...last].length >= MIN_PREFIX_LENGTH ? ':*' : '';
  const query = `${tokens.join(' & ')}${prefix}`;
  return Prisma.sql`(p.search_vector @@ to_tsquery('russian', ${query}) OR lower(p.article) = lower(${q}))`;
}

// The filters of the list, its total and the filter counts, as a condition on `products p`: one
// builder, so they agree (spec 0014 plan §2.2). Filters AND together; the values of one filter OR
// (0004 E45). A size counts only in stock (E13b). Every value is a parameter; lists go through
// `Prisma.join`.
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
    and.push(searchSql(filter.q));
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
