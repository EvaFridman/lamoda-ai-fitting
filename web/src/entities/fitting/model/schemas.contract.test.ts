import { describe, expect, it } from 'vitest';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import {
  fittingListSchema,
  fittingQuotaSchema,
  fittingSchema,
  startedFittingSchema,
} from './schemas';

const checks: ContractCheck[] = [
  { name: 'fittingSchema', schema: fittingSchema, component: 'FittingDto' },
  { name: 'startedFittingSchema', schema: startedFittingSchema, component: 'StartedFittingDto' },
  { name: 'fittingQuotaSchema', schema: fittingQuotaSchema, component: 'FittingQuotaDto' },
  {
    name: 'fittingListSchema',
    schema: fittingListSchema,
    response: { method: 'get', path: '/fittings', status: '200' },
  },
  {
    name: 'fittingSchema (route)',
    schema: fittingSchema,
    response: { method: 'get', path: '/fittings/{id}', status: '200' },
  },
  {
    name: 'startedFittingSchema (start, repeated)',
    schema: startedFittingSchema,
    response: { method: 'post', path: '/fittings', status: '200' },
  },
  {
    name: 'startedFittingSchema (start)',
    schema: startedFittingSchema,
    response: { method: 'post', path: '/fittings', status: '201' },
  },
  {
    name: 'startedFittingSchema (regenerate)',
    schema: startedFittingSchema,
    response: { method: 'post', path: '/fittings/{id}/regenerate', status: '201' },
  },
  {
    name: 'fittingQuotaSchema (route)',
    schema: fittingQuotaSchema,
    response: { method: 'get', path: '/me/fitting-quota', status: '200' },
  },
];

describe('fitting schemas match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});
