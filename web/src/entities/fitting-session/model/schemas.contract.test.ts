import { describe, expect, it } from 'vitest';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import { fittingSessionListSchema, fittingSessionSchema } from './schemas';

const checks: ContractCheck[] = [
  {
    name: 'fittingSessionSchema',
    schema: fittingSessionSchema,
    component: 'FittingSessionResponseDto',
  },
  {
    name: 'fittingSessionListSchema',
    schema: fittingSessionListSchema,
    response: { method: 'get', path: '/fitting-sessions', status: '200' },
  },
  {
    name: 'fittingSessionSchema (route)',
    schema: fittingSessionSchema,
    response: { method: 'get', path: '/fitting-sessions/{id}', status: '200' },
  },
];

describe('fitting session schemas match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});
