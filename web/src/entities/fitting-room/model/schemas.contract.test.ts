import { describe, expect, it } from 'vitest';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import { fittingRoomChangeSchema, fittingRoomItemSchema, fittingRoomSchema } from './schemas';

const checks: ContractCheck[] = [
  { name: 'fittingRoomItemSchema', schema: fittingRoomItemSchema, component: 'FittingRoomItemDto' },
  { name: 'fittingRoomSchema', schema: fittingRoomSchema, component: 'FittingRoomDto' },
  {
    name: 'fittingRoomChangeSchema',
    schema: fittingRoomChangeSchema,
    component: 'FittingRoomChangeDto',
  },
  {
    name: 'fittingRoomSchema (GET)',
    schema: fittingRoomSchema,
    response: { method: 'get', path: '/me/fitting-room', status: '200' },
  },
  {
    name: 'fittingRoomChangeSchema (PUT)',
    schema: fittingRoomChangeSchema,
    response: { method: 'put', path: '/me/fitting-room/{slot}', status: '200' },
  },
];

describe('fitting room schemas match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});
