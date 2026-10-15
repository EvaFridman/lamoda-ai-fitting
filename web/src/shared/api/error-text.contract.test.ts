import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import { errorDetailSchema } from './api-error';
import { ERROR_TEXTS } from './error-text';

// The dictionary's codes against the api's `ErrorCode` (plan §6): a code on one side only fails,
// named. `details` codes are a plain string in the document; only unit tests cover their texts.
const checks: ContractCheck[] = [
  {
    name: 'ERROR_TEXTS codes',
    schema: z.enum(Object.keys(ERROR_TEXTS) as [string, ...string[]]),
    component: 'ErrorCode',
  },
  { name: 'errorDetailSchema', schema: errorDetailSchema, component: 'ErrorDetailDto' },
];

describe('error texts match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});

describe('the contract check catches a dictionary out of step', () => {
  const keys = Object.keys(ERROR_TEXTS);

  it('fails for a code missing from the dictionary, naming it', () => {
    const [missing, ...rest] = keys;
    const diff = contractDiff(openApiDocument(), {
      name: 'without one',
      schema: z.enum(rest as [string, ...string[]]),
      component: 'ErrorCode',
    });
    expect(diff.length).toBeGreaterThan(0);
    expect(JSON.stringify(diff)).toContain(missing);
  });

  it('fails for a code the api does not have', () => {
    const diff = contractDiff(openApiDocument(), {
      name: 'with an extra',
      schema: z.enum(['NOT_IN_THE_API', ...keys]),
      component: 'ErrorCode',
    });
    expect(diff.length).toBeGreaterThan(0);
    expect(JSON.stringify(diff)).toContain('NOT_IN_THE_API');
  });
});
