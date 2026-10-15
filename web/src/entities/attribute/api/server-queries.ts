import 'server-only';

import { queryOptions } from '@tanstack/react-query';

import { buildPath, type PageQuery } from '@/shared/api';
import { apiFetch } from '@/shared/api/server';

import {
  attributeListSchema,
  attributeSchema,
  attributeValueListSchema,
  type Attribute,
  type AttributeList,
  type AttributeValueList,
} from '../model/schemas';
import { attributeKeys, attributePageQuery } from './keys';

// GET /attributes.
export async function getAttributes(query: PageQuery = {}): Promise<AttributeList> {
  return apiFetch(buildPath('/attributes', {}, attributePageQuery(query)), attributeListSchema);
}

// GET /attributes/:id.
export async function getAttribute(id: string): Promise<Attribute> {
  return apiFetch(buildPath('/attributes/:id', { id }), attributeSchema);
}

// GET /attributes/:id/values.
export async function getAttributeValues(
  attributeId: string,
  query: PageQuery = {},
): Promise<AttributeValueList> {
  return apiFetch(
    buildPath('/attributes/:id/values', { id: attributeId }, attributePageQuery(query)),
    attributeValueListSchema,
  );
}

export function attributeListOptions(query: PageQuery = {}) {
  return queryOptions({
    queryKey: attributeKeys.list(query),
    queryFn: () => getAttributes(query),
  });
}

export function attributeOptions(id: string) {
  return queryOptions({ queryKey: attributeKeys.detail(id), queryFn: () => getAttribute(id) });
}

export function attributeValueListOptions(attributeId: string, query: PageQuery = {}) {
  return queryOptions({
    queryKey: attributeKeys.values(attributeId, query),
    queryFn: () => getAttributeValues(attributeId, query),
  });
}
