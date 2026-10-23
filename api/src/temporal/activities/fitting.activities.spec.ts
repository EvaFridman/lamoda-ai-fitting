import { ApplicationFailure } from '@temporalio/activity';
import { describe, expect, it } from 'vitest';

import { AiProviderError } from '../../ai/ai-provider.error.js';
import { StorageError } from '../../storage/storage.error.js';
import { fittingFailure } from './fitting.activities.js';

describe('fittingFailure', () => {
  it('names a timeout model_timeout, never retried, with no request id', () => {
    const failure = fittingFailure(new AiProviderError('edit_image', 'timeout', null, null, null));

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect(failure.type).toBe('model_timeout');
    expect(failure.nonRetryable).toBe(true);
    expect(failure.details).toEqual([null]);
  });

  it('names a provider failure provider_error and carries OpenAI request id as the detail', () => {
    const failure = fittingFailure(new AiProviderError('edit_image', 'http', 500, 'oops', 'req_1'));

    expect(failure.type).toBe('provider_error');
    expect(failure.nonRetryable).toBe(true);
    expect(failure.details).toEqual(['req_1']);
    expect(failure.message).toBe('OpenAI edit_image: http 500 oops (request req_1)');
  });

  it('names a cancelled call (reason aborted) provider_error', () => {
    const failure = fittingFailure(new AiProviderError('edit_image', 'aborted', null, null, null));

    expect(failure.type).toBe('provider_error');
  });

  it('keeps the message of a storage error, which holds no key', () => {
    const failure = fittingFailure(new StorageError('GetObject', 'NoSuchKey', 404, 'abc'));

    expect(failure.type).toBe('provider_error');
    expect(failure.message).toBe('Storage GetObject failed: NoSuchKey (HTTP 404)');
    expect(failure.details).toEqual([null]);
  });

  it('gives only the name of any other error, never its text', () => {
    const failure = fittingFailure(new TypeError('keep/users/secret person@example.com'));

    expect(failure.type).toBe('provider_error');
    expect(failure.message).toBe('TypeError');
    expect(failure.nonRetryable).toBe(true);
    expect(failure.cause).toBeUndefined();
  });

  it('keeps the cause of the errors whose text holds nothing of the user', () => {
    const ai = new AiProviderError('edit_image', 'http', 500, null, null);
    const storage = new StorageError('GetObject', 'NoSuchKey', 404, undefined);

    expect(fittingFailure(ai).cause).toBeDefined();
    expect(fittingFailure(storage).cause).toBeDefined();
  });

  it('gives a fixed text for a thrown value that is not an error', () => {
    const failure = fittingFailure('keep/users/secret');

    expect(failure.type).toBe('provider_error');
    expect(failure.message).toBe('Unknown error');
  });

  it('returns an ApplicationFailure as it is', () => {
    const own = ApplicationFailure.nonRetryable('gone', 'provider_error');

    expect(fittingFailure(own)).toBe(own);
  });

  it('cuts the message to the 1000 characters the column holds', () => {
    const failure = fittingFailure(
      new AiProviderError('edit_image', 'http', 400, 'x'.repeat(3000), null),
    );

    expect(failure.message).toHaveLength(1000);
  });
});
