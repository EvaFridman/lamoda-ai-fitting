import type { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';

// What the ai module reads from the environment (spec 0019 plan §3, §10). One provider, so a test
// can replace it.
export interface AiSettings {
  nodeEnv: Env['NODE_ENV'];
  // Empty selects the fake provider (A4).
  apiKey: string;
  // The image model of the edits endpoint (A17): the short name `aiModel` stores.
  model: string;
  // The small vision model of the photo and text checks (A15).
  visionModel: string;
  // Seconds one generation may take at the model (A28).
  timeoutSeconds: number;
  // Milliseconds a check inside a request may take, both of its calls together (A45).
  checkTimeoutMs: number;
  // Try-ons per user and calendar month (A5).
  monthlyLimit: number;
  // Largest photo a user may upload, in bytes (A31).
  photoMaxBytes: number;
}

export const AI_SETTINGS = Symbol('AI_SETTINGS');

export function aiSettings(config: ConfigService<Env, true>): AiSettings {
  return {
    nodeEnv: config.get('NODE_ENV', { infer: true }),
    apiKey: config.get('OPENAI_API_KEY', { infer: true }),
    model: config.get('FITTING_MODEL', { infer: true }),
    visionModel: config.get('FITTING_VISION_MODEL', { infer: true }),
    timeoutSeconds: config.get('FITTING_TIMEOUT_SECONDS', { infer: true }),
    checkTimeoutMs: config.get('FITTING_CHECK_TIMEOUT_MS', { infer: true }),
    monthlyLimit: config.get('FITTING_MONTHLY_LIMIT', { infer: true }),
    photoMaxBytes: config.get('FITTING_PHOTO_MAX_BYTES', { infer: true }),
  };
}
