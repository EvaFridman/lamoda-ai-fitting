import 'server-only';

import { queryOptions } from '@tanstack/react-query';

import { buildPath, type PageQuery } from '@/shared/api';
import { apiFetch } from '@/shared/api/server';

import { brandListSchema, brandSchema, type Brand, type BrandList } from '../model/schemas';
import { brandKeys, brandListQuery } from './keys';

// GET /brands.
export async function getBrands(query: PageQuery = {}): Promise<BrandList> {
  return apiFetch(buildPath('/brands', {}, brandListQuery(query)), brandListSchema);
}

// GET /brands/:id.
export async function getBrand(id: string): Promise<Brand> {
  return apiFetch(buildPath('/brands/:id', { id }), brandSchema);
}

export function brandListOptions(query: PageQuery = {}) {
  return queryOptions({ queryKey: brandKeys.list(query), queryFn: () => getBrands(query) });
}

export function brandOptions(id: string) {
  return queryOptions({ queryKey: brandKeys.detail(id), queryFn: () => getBrand(id) });
}
