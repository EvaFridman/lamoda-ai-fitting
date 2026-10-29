import { beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/shared/analytics', () => ({ track }));

import { ApiError } from '@/shared/api';

import {
  fittingRefusal,
  startRetryCause,
  trackFittingOutcome,
  trackFittingRefused,
  trackFittingStarted,
  watchFitting,
} from './analytics';
import type { Fitting, StartedFitting } from './schemas';

let counter = 0;

function fitting(patch: Partial<Fitting> = {}): Fitting {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    kind: 'single',
    parentId: null,
    status: 'completed',
    stage: 'done',
    failureCode: null,
    failureCategory: null,
    failureStage: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items: [],
    promptText: null,
    photoId: null,
    photoTransient: null,
    resultUrl: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    startedAt: '2026-10-20T12:00:01.000Z',
    finishedAt: '2026-10-20T12:00:31.400Z',
    estimatedSeconds: null,
    ...patch,
  };
}

function started(patch: Partial<StartedFitting> = {}): StartedFitting {
  return {
    ...fitting({ status: 'pending', stage: 'queued', finishedAt: null }),
    repeated: false,
    ...patch,
  };
}

function httpError(code: string): ApiError {
  return new ApiError('refused', {
    kind: 'http',
    template: '/fittings',
    method: 'POST',
    status: 409,
    code,
  });
}

function promptRefused(message: string): ApiError {
  return new ApiError('refused', {
    kind: 'http',
    template: '/fittings',
    method: 'POST',
    status: 400,
    code: 'PROMPT_REFUSED',
    details: [{ field: 'promptText', code: 'PROMPT_REFUSED', message }],
  });
}

beforeEach(() => {
  track.mockReset();
});

describe('trackFittingOutcome', () => {
  it('sends nothing for a fitting this tab did not watch', () => {
    trackFittingOutcome(fitting());
    expect(track).not.toHaveBeenCalled();
  });

  it('sends Fitting Completed with the duration for a watched fitting', () => {
    const done = fitting();
    watchFitting(done.id);
    trackFittingOutcome(done);
    expect(track).toHaveBeenCalledExactlyOnceWith('Fitting Completed', {
      kind: 'single',
      model: 'gpt-image-2',
      duration: 31,
      counts_against_limit: true,
      repeated: false,
    });
  });

  it('sends the outcome of a fitting once, however many times it is seen', () => {
    const done = fitting();
    watchFitting(done.id);
    trackFittingOutcome(done);
    trackFittingOutcome(done);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('sends nothing while the fitting still runs, then its end', () => {
    const running = fitting({ status: 'processing', stage: 'generating', finishedAt: null });
    watchFitting(running.id);
    trackFittingOutcome(running);
    expect(track).not.toHaveBeenCalled();
    trackFittingOutcome({ ...running, status: 'completed', stage: 'done' });
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('sends Fitting Failed with its reason and duration', () => {
    const failed = fitting({
      status: 'failed',
      failureCode: 'model_timeout',
      countsAgainstLimit: false,
    });
    watchFitting(failed.id);
    trackFittingOutcome(failed);
    expect(track).toHaveBeenCalledExactlyOnceWith('Fitting Failed', {
      kind: 'single',
      reason: 'model_timeout',
      model: 'gpt-image-2',
      duration: 31,
    });
  });

  it('sends nothing for a failed fitting that names no reason', () => {
    const failed = fitting({ status: 'failed', failureCode: null });
    watchFitting(failed.id);
    trackFittingOutcome(failed);
    expect(track).not.toHaveBeenCalled();
  });

  it.each([
    ['gpt-image-2', 'gpt-image-2'],
    ['gpt-image-2.5-sunburst', 'gpt-image-2-5-sunburst'],
    ['fake-model', 'other'],
  ])('maps the model %s to %s', (model, name) => {
    const done = fitting({ model });
    watchFitting(done.id);
    trackFittingOutcome(done);
    expect(track.mock.calls[0]?.[1]).toMatchObject({ model: name });
  });

  it('counts a negative span as 0 seconds', () => {
    const done = fitting({ finishedAt: '2026-10-20T11:59:00.000Z' });
    watchFitting(done.id);
    trackFittingOutcome(done);
    expect(track.mock.calls[0]?.[1]).toMatchObject({ duration: 0 });
  });
});

describe('trackFittingStarted', () => {
  it('sends Fitting Started and watches the fitting, so its end is sent', () => {
    const run = started({
      items: [
        {
          productId: '00000000-0000-4000-8000-0000000000a1',
          name: 'Dress',
          brand: 'B',
          imageUrl: null,
          price: 1,
          finalPrice: 1,
          attributeValueId: null,
          colour: null,
          slot: 'top',
        },
      ],
    });
    trackFittingStarted(run, 'picker', false);
    expect(track).toHaveBeenCalledExactlyOnceWith('Fitting Started', {
      kind: 'single',
      source: 'picker',
      items: 1,
      repeated: false,
      with_prompt: false,
    });
    trackFittingOutcome({ ...run, status: 'completed', stage: 'done' });
    expect(track).toHaveBeenLastCalledWith(
      'Fitting Completed',
      expect.objectContaining({ repeated: false }),
    );
  });

  it('carries the source and the wish flag of a regeneration', () => {
    trackFittingStarted(started(), 'regenerate', true);
    expect(track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ source: 'regenerate', with_prompt: true }),
    );
  });

  it('sends the result of a repeated start at once, free', () => {
    const repeat = started({ status: 'completed', stage: 'done', repeated: true });
    trackFittingStarted(repeat, 'colour', false);
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenNthCalledWith(
      1,
      'Fitting Started',
      expect.objectContaining({ repeated: true }),
    );
    expect(track).toHaveBeenNthCalledWith(2, 'Fitting Completed', {
      kind: 'single',
      model: 'gpt-image-2',
      duration: 0,
      counts_against_limit: false,
      repeated: true,
    });
  });

  it('does not send the repeated result again when the page reads it later', () => {
    const repeat = started({ status: 'completed', stage: 'done', repeated: true });
    trackFittingStarted(repeat, 'picker', false);
    track.mockReset();

    trackFittingOutcome(repeat);

    expect(track).not.toHaveBeenCalled();
  });

  it('sends a started fitting that is not a repeat only once it ends', () => {
    trackFittingStarted(started(), 'picker', false);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Fitting Started', expect.anything());
  });
});

describe('startRetryCause', () => {
  const failure = (kind: 'network' | 'timeout' | 'http' | 'schema', status?: number) =>
    new ApiError('x', { kind, template: '/fittings', ...(status ? { status } : {}) });

  it.each([
    [failure('network'), 'network'],
    [failure('timeout'), 'timeout'],
    [failure('http', 502), 'server'],
    [failure('http', 503), 'server'],
    [failure('http', 504), 'server'],
    [failure('http', 500), null],
    [failure('http', 429), null],
    [failure('http', 400), null],
    [failure('schema'), null],
    [new Error('x'), null],
  ])('names the cause of %o as %s', (error, cause) => {
    expect(startRetryCause(error)).toBe(cause);
  });
});

describe('fittingRefusal and trackFittingRefused', () => {
  it('names the limit and the refused text', () => {
    expect(fittingRefusal(httpError('LIMIT_REACHED'))).toBe('limit_reached');
    expect(fittingRefusal(httpError('PROMPT_REFUSED'))).toBe('prompt_refused');
  });

  it('names nothing for another code, another error kind or a plain error', () => {
    expect(fittingRefusal(httpError('NOT_COMPLETED'))).toBeNull();
    expect(
      fittingRefusal(
        new ApiError('x', { kind: 'network', template: '/fittings', code: 'LIMIT_REACHED' }),
      ),
    ).toBeNull();
    expect(fittingRefusal(new Error('boom'))).toBeNull();
  });

  it('sends Fitting Refused only for a refusal and gives the reason', () => {
    expect(trackFittingRefused(httpError('LIMIT_REACHED'), 'single')).toBe('limit_reached');
    expect(track).toHaveBeenCalledExactlyOnceWith('Fitting Refused', {
      kind: 'single',
      reason: 'limit_reached',
    });
    track.mockReset();
    expect(trackFittingRefused(httpError('INTERNAL'), 'look')).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it('sends no prompt_reason for the limit', () => {
    trackFittingRefused(httpError('LIMIT_REACHED'), 'look');
    expect(track.mock.calls[0]?.[1]).not.toHaveProperty('prompt_reason');
  });

  it.each([
    ['other_people', 'other_people'],
    ['minors', 'minors'],
    ['moderation:minors', 'minors'],
    ['nudity', 'unsafe'],
    ['violence', 'unsafe'],
    ['moderation:violence', 'unsafe'],
    ['moderation:sexual', 'unsafe'],
    ['moderation:self_harm', 'unsafe'],
    ['moderation:hate', 'unsafe'],
    ['moderation:illicit', 'unsafe'],
    ['unrelated', 'off_topic'],
    ['politics', 'off_topic'],
    ['moderation:unknown', 'off_topic'],
    ['something_else', 'off_topic'],
  ])('groups the text reason %s as %s', (reason, group) => {
    expect(trackFittingRefused(promptRefused(`promptText was refused: ${reason}`), 'single')).toBe(
      'prompt_refused',
    );
    expect(track).toHaveBeenCalledExactlyOnceWith('Fitting Refused', {
      kind: 'single',
      reason: 'prompt_refused',
      prompt_reason: group,
    });
  });

  it('groups a refusal with no detail as off_topic', () => {
    trackFittingRefused(httpError('PROMPT_REFUSED'), 'single');
    expect(track.mock.calls[0]?.[1]).toMatchObject({ prompt_reason: 'off_topic' });
  });
});
