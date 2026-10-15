import 'server-only';

import { queryOptions } from '@tanstack/react-query';

import { buildPath } from '@/shared/api';
import { apiFetch } from '@/shared/api/server';

import {
  categoryListSchema,
  categorySchema,
  type Category,
  type CategoryList,
} from '../model/schemas';
import { categoryKeys, categoryListQuery, type CategoryListQuery } from './keys';

// GET /categories.
export async function getCategories(query: CategoryListQuery = {}): Promise<CategoryList> {
  return apiFetch(buildPath('/categories', {}, categoryListQuery(query)), categoryListSchema);
}

// GET /categories/:id.
export async function getCategory(id: string): Promise<Category> {
  return apiFetch(buildPath('/categories/:id', { id }), categorySchema);
}

export function categoryListOptions(query: CategoryListQuery = {}) {
  return queryOptions({ queryKey: categoryKeys.list(query), queryFn: () => getCategories(query) });
}

export function categoryOptions(id: string) {
  return queryOptions({ queryKey: categoryKeys.detail(id), queryFn: () => getCategory(id) });
}
