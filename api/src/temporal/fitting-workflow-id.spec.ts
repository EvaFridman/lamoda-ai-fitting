import { describe, expect, it } from 'vitest';

import {
  fittingWorkflowId,
  GENERATE_OVERHEAD_SECONDS,
  generateTimeLimitSeconds,
} from './fitting-workflow-id.js';

describe('fittingWorkflowId', () => {
  it('is one id per generation', () => {
    expect(fittingWorkflowId('abc')).toBe('fitting-abc');
    expect(fittingWorkflowId('abc')).not.toBe(fittingWorkflowId('abd'));
  });
});

describe('generateTimeLimitSeconds', () => {
  it('adds the 60 s overhead to the model deadline', () => {
    expect(GENERATE_OVERHEAD_SECONDS).toBe(60);
    expect(generateTimeLimitSeconds(180)).toBe(240);
    expect(generateTimeLimitSeconds(0)).toBe(60);
  });
});
