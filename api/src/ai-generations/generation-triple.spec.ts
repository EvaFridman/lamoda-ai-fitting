import { describe, expect, it } from 'vitest';

import { checkGenerationTriple, type GenerationTriple } from './generation-triple.js';

const KEY = 'generations/result.jpg';
const ERROR = 'PROVIDER_TIMEOUT';

function fields(triple: GenerationTriple): string[] {
  return checkGenerationTriple(triple).map((detail) => detail.field);
}

describe('checkGenerationTriple', () => {
  it.each(['pending', 'processing'] as const)(
    'accepts %s with no result and no error',
    (status) => {
      expect(checkGenerationTriple({ status, resultImageKey: null, errorMessage: null })).toEqual(
        [],
      );
    },
  );

  it.each(['pending', 'processing'] as const)('refuses %s with a result', (status) => {
    const details = checkGenerationTriple({ status, resultImageKey: KEY, errorMessage: null });

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ field: 'resultImageKey', code: 'MATCHES_STATUS' });
  });

  it.each(['pending', 'processing'] as const)('refuses %s with an error', (status) => {
    const details = checkGenerationTriple({ status, resultImageKey: null, errorMessage: ERROR });

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ field: 'errorMessage', code: 'MATCHES_STATUS' });
  });

  it('gives one detail per broken part', () => {
    expect(fields({ status: 'pending', resultImageKey: KEY, errorMessage: ERROR }).sort()).toEqual([
      'errorMessage',
      'resultImageKey',
    ]);
  });

  it('accepts completed with a result and no error', () => {
    expect(
      checkGenerationTriple({ status: 'completed', resultImageKey: KEY, errorMessage: null }),
    ).toEqual([]);
  });

  it('refuses completed with no result', () => {
    const details = checkGenerationTriple({
      status: 'completed',
      resultImageKey: null,
      errorMessage: null,
    });

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ field: 'resultImageKey', code: 'MATCHES_STATUS' });
  });

  it('refuses completed with an error', () => {
    const details = checkGenerationTriple({
      status: 'completed',
      resultImageKey: KEY,
      errorMessage: ERROR,
    });

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ field: 'errorMessage', code: 'MATCHES_STATUS' });
  });

  it('refuses completed with an error and no result, one detail for each', () => {
    expect(
      fields({ status: 'completed', resultImageKey: null, errorMessage: ERROR }).sort(),
    ).toEqual(['errorMessage', 'resultImageKey']);
  });

  it.each([null, KEY])('accepts failed with an error and result %s', (resultImageKey) => {
    expect(
      checkGenerationTriple({ status: 'failed', resultImageKey, errorMessage: ERROR }),
    ).toEqual([]);
  });

  it.each([null, KEY])('refuses failed with no error and result %s', (resultImageKey) => {
    const details = checkGenerationTriple({
      status: 'failed',
      resultImageKey,
      errorMessage: null,
    });

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ field: 'errorMessage', code: 'MATCHES_STATUS' });
  });
});
