import { describe, expect, it } from 'vitest';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import { generationListSchema, generationSchema } from './schemas';

const checks: ContractCheck[] = [
  { name: 'generationSchema', schema: generationSchema, component: 'AiGenerationResponseDto' },
  {
    name: 'generationListSchema',
    schema: generationListSchema,
    response: { method: 'get', path: '/ai-generations', status: '200' },
  },
  {
    name: 'generationSchema (route)',
    schema: generationSchema,
    response: { method: 'get', path: '/ai-generations/{id}', status: '200' },
  },
];

describe('generation schemas match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});
