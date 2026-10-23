import {
  defaultProductSort,
  type FacetAttribute,
  type ProductSort,
  splitFacetAttributes,
} from '@/entities/product';
import type { AnalyticsEvents } from '@/shared/analytics';

import type { CatalogQuery } from './url-state';

type FilterApplied = AnalyticsEvents['Catalog Filter Applied'];

function sameValues(a: readonly string[] = [], b: readonly string[] = []): boolean {
  const set = new Set(a);
  return a.length === b.length && b.every((value) => set.has(value));
}

function priceBounds(query: CatalogQuery): number {
  return Number(query.minPrice !== undefined) + Number(query.maxPrice !== undefined);
}

// "Catalog Filter Applied" for each filter a change of the selection changed (O101): `values` is
// how many are chosen after it, 0 when the filter is gone; the values themselves are never sent.
// An attribute is a colour or not by the counts the filters show (`attributes`: the current answer
// or the one the page kept, 0020 plan §4); chosen values of an attribute the counts do not list
// (there are none, or they no longer have it) count as one `attribute`.
export function filterChanges(
  before: CatalogQuery,
  after: CatalogQuery,
  attributes: readonly FacetAttribute[],
): FilterApplied[] {
  const changes: FilterApplied[] = [];
  const compare = (
    filter: FilterApplied['filter'],
    from: readonly string[] | undefined,
    to: readonly string[] | undefined,
  ) => {
    if (!sameValues(from, to)) changes.push({ filter, values: to?.length ?? 0 });
  };

  compare('brand', before.brandId, after.brandId);
  compare('size', before.size, after.size);
  const { colours, others } = splitFacetAttributes(attributes);
  const listed = new Set<string>();
  const groups = [
    ['color', colours],
    ['attribute', others],
  ] as const;
  for (const [filter, group] of groups) {
    for (const attribute of group) {
      const own = new Set(attribute.values.map((value) => value.id));
      for (const id of own) listed.add(id);
      const of = (query: CatalogQuery) => query.attributeValueId?.filter((id) => own.has(id));
      compare(filter, of(before), of(after));
    }
  }
  const unlisted = (query: CatalogQuery) => query.attributeValueId?.filter((id) => !listed.has(id));
  compare('attribute', unlisted(before), unlisted(after));
  if (before.minPrice !== after.minPrice || before.maxPrice !== after.maxPrice) {
    changes.push({ filter: 'price', values: priceBounds(after) });
  }
  if ((before.hasDiscount === true) !== (after.hasDiscount === true)) {
    changes.push({ filter: 'discount', values: after.hasDiscount === true ? 1 : 0 });
  }
  return changes;
}

// The new order, when a change of the selection changed it.
export function sortChange(before: CatalogQuery, after: CatalogQuery): ProductSort | undefined {
  const from = before.sort ?? defaultProductSort;
  const to = after.sort ?? defaultProductSort;
  return from === to ? undefined : to;
}
