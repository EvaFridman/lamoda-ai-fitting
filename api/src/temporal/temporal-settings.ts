import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';

// Where the api starts workflows. One provider, so the database tests replace it with their
// throwaway Temporal and a task queue of the test file's own (test/support/test-app.ts).
export interface TemporalSettings {
  address: string;
  namespace: string;
  taskQueue: string;
}

export const TEMPORAL_SETTINGS = Symbol('TEMPORAL_SETTINGS');

export function temporalSettings(config: ConfigService<Env, true>): TemporalSettings {
  return {
    address: config.get('TEMPORAL_ADDRESS', { infer: true }),
    namespace: config.get('TEMPORAL_NAMESPACE', { infer: true }),
    taskQueue: config.get('TEMPORAL_TASK_QUEUE', { infer: true }),
  };
}
