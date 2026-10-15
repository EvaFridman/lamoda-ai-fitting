import { describe, expect, it } from 'vitest';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import {
  attributeListSchema,
  attributeSchema,
  attributeValueListSchema,
  attributeValueSchema,
} from './schemas';

const checks: ContractCheck[] = [
  { name: 'attributeSchema', schema: attributeSchema, component: 'AttributeResponseDto' },
  {
    name: 'attributeValueSchema',
    schema: attributeValueSchema,
    component: 'AttributeValueResponseDto',
  },
  {
    name: 'attributeListSchema',
    schema: attributeListSchema,
    response: { method: 'get', path: '/attributes', status: '200' },
  },
  {
    name: 'attributeSchema (route)',
    schema: attributeSchema,
    response: { method: 'get', path: '/attributes/{id}', status: '200' },
  },
  {
    name: 'attributeValueListSchema',
    schema: attributeValueListSchema,
    response: { method: 'get', path: '/attributes/{id}/values', status: '200' },
  },
];

describe('attribute schemas match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});
