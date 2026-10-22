import sharp from 'sharp';

import { AiProviderError } from './ai-provider.error.js';
import type { AiSettings } from './ai-settings.js';
import { ModerationChecker, type ModerationResult } from './checks/moderation-checker.js';
import {
  PHOTO_VISION_REASONS,
  type PhotoCheck,
  PhotoChecker,
  type PhotoRefusalReason,
} from './checks/photo-checker.js';
import {
  PROMPT_CLASSIFICATION_REASONS,
  type PromptCheck,
  PromptChecker,
} from './checks/prompt-checker.js';
import { abortKind, sleep, withDeadline } from './deadline.js';
import type { ImageInput } from './image-input.js';
import { type AiLogger, type CallOptions, OpenAiClient } from './openai-client.js';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiCallOptions {
  // The caller's own cancellation (a cancelled activity's `cancellationSignal`); the provider adds
  // the deadline. A cancelled call throws an AiProviderError with reason `aborted`, which Temporal
  // does not know as a cancellation: an activity rethrows `signal.reason` whenever `signal.aborted`
  // (as files.activities.ts does), so the SDK and the Sentry interceptor see the CancelledFailure.
  signal?: AbortSignal;
  // The call's deadline in milliseconds, instead of the settings' check deadline
  // (`FITTING_CHECK_TIMEOUT_MS`): a Temporal activity passes a budget below its
  // `startToCloseTimeout`, since the check deadline is the budget of an HTTP handler (A45), not of
  // the result's moderation (plan §4). Less than a millisecond, or not a number, falls back to it.
  timeoutMs?: number;
  // Whether the client tries a transient failure again (three attempts, the default, for a route);
  // an activity with a retry policy of its own passes false (plan §4), so one call is not repeated
  // twice over and a paid generation runs once per attempt.
  retry?: boolean;
}

// What the routes and the activities see of the AI (spec 0019 plan §3): the checks here, the
// generation when the image model lands (T10). Each call runs under one deadline, the settings'
// check deadline unless the caller names its own, the caller's signal joined in; a deadline that
// passes throws an AiProviderError whose `isTimeout` is true. In a route (`POST /me/photos`, T4;
// `POST /fittings`, T9) that is a 503 with nothing stored (A45).
export interface AiProvider {
  // `openai`, what `aiProvider` stores (plan §3); `fake` where no key is set.
  readonly name: 'openai' | 'fake';
  checkPhoto(image: ImageInput, options?: AiCallOptions): Promise<PhotoCheck>;
  checkPrompt(text: string, options?: AiCallOptions): Promise<PromptCheck>;
  moderateImage(image: ImageInput, options?: AiCallOptions): Promise<ModerationResult>;
}

// The real one: the three checkers over one OpenAiClient.
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly photos: PhotoChecker;
  private readonly prompts: PromptChecker;
  private readonly moderation: ModerationChecker;

  constructor(
    client: OpenAiClient,
    private readonly settings: Pick<AiSettings, 'visionModel' | 'checkTimeoutMs'>,
    logger: AiLogger,
  ) {
    this.moderation = new ModerationChecker(client);
    this.photos = new PhotoChecker(client, this.moderation, settings.visionModel, logger);
    this.prompts = new PromptChecker(client, this.moderation, settings.visionModel, logger);
  }

  checkPhoto(image: ImageInput, options: AiCallOptions = {}): Promise<PhotoCheck> {
    return this.photos.check(image, this.callOptions(options));
  }

  checkPrompt(text: string, options: AiCallOptions = {}): Promise<PromptCheck> {
    return this.prompts.check(text, this.callOptions(options));
  }

  moderateImage(image: ImageInput, options: AiCallOptions = {}): Promise<ModerationResult> {
    return this.moderation.checkImage(image, this.callOptions(options));
  }

  private callOptions(options: AiCallOptions): CallOptions {
    return {
      signal: withDeadline(deadlineMs(options, this.settings), options.signal),
      retry: options.retry,
    };
  }
}

// The call's deadline: the caller's, when it is a time, else the settings' check deadline.
export function deadlineMs(
  options: AiCallOptions,
  settings: Pick<AiSettings, 'checkTimeoutMs'>,
): number {
  const ms = options.timeoutMs;
  return ms !== undefined && Number.isFinite(ms) && ms >= 1 ? ms : settings.checkTimeoutMs;
}

// The marker the e2e put into a photo's bytes or a text to get a refusal: `refuse:<reason>`, a
// reason of the check (`refuse:child`, `refuse:unrelated`) or `refuse:moderation`.
const MARKER = /refuse:([a-z_]+)/;

// The marker of a photo that went through the upload: the check runs on sharp's WebP (plan §5),
// where no byte of the upload survives, so there the marker is the photo's colour, one solid
// colour per reason. A real photo is never one colour, so an honest one passes; `dark` is a black
// photo, as a real check would see it. The e2e and a check by hand make such images
// (test/support/photos.ts).
export const REFUSAL_COLOURS: Readonly<
  Record<PhotoRefusalReason, readonly [number, number, number]>
> = {
  dark: [0, 0, 0],
  not_full: [255, 0, 0],
  many_people: [0, 255, 0],
  child: [0, 0, 255],
  no_person: [255, 255, 0],
  moderation: [255, 0, 255],
};
// Lossy WebP moves a solid colour by a level or two; a photo's channels spread far wider.
const COLOUR_TOLERANCE = 12;

// The reason of a solid-colour image, null for anything else (a photo, an unreadable buffer).
export async function solidColourReason(bytes: Uint8Array): Promise<PhotoRefusalReason | null> {
  let channels: { mean: number; stdev: number }[];
  try {
    ({ channels } = await sharp(Buffer.from(bytes)).stats());
  } catch {
    return null;
  }
  // A grey image has one channel; an alpha channel, if any, is not looked at.
  const [r, g, b] = channels.length < 3 ? [channels[0], channels[0], channels[0]] : channels;
  if (r === undefined || g === undefined || b === undefined) return null;
  const means = [r, g, b];
  if (means.some((channel) => channel.stdev > COLOUR_TOLERANCE)) return null;
  const found = (Object.entries(REFUSAL_COLOURS) as [PhotoRefusalReason, readonly number[]][]).find(
    ([, colour]) =>
      colour.every(
        (level, index) => Math.abs((means[index]?.mean ?? Number.NaN) - level) <= COLOUR_TOLERANCE,
      ),
  );
  return found?.[0] ?? null;
}

// The provider without a key (locally, in tests and CI, A4): deterministic answers, no network.
// A test sets `delayMs` on the instance (plan §3: not an env variable) to see the deadline pass.
export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';
  delayMs = 0;

  constructor(private readonly settings: Pick<AiSettings, 'checkTimeoutMs'>) {}

  async checkPhoto(image: ImageInput, options: AiCallOptions = {}): Promise<PhotoCheck> {
    await this.wait(options);
    const reason =
      marker(Buffer.from(image.bytes).toString('latin1')) ?? (await solidColourReason(image.bytes));
    if (reason === 'moderation') return { ok: false, reason };
    if (isOneOf(reason, PHOTO_VISION_REASONS)) return { ok: false, reason };
    return { ok: true };
  }

  async checkPrompt(text: string, options: AiCallOptions = {}): Promise<PromptCheck> {
    await this.wait(options);
    const reason = marker(text);
    if (reason === 'moderation') return { allowed: false, reason };
    if (isOneOf(reason, PROMPT_CLASSIFICATION_REASONS)) return { allowed: false, reason };
    return { allowed: true };
  }

  async moderateImage(image: ImageInput, options: AiCallOptions = {}): Promise<ModerationResult> {
    await this.wait(options);
    const flagged =
      (marker(Buffer.from(image.bytes).toString('latin1')) ??
        (await solidColourReason(image.bytes))) === 'moderation';
    return { flagged, categories: flagged ? ['sexual'] : [] };
  }

  // The delay under the same deadline as a real call: a delay past it throws the same timeout.
  private async wait(options: AiCallOptions): Promise<void> {
    if (this.delayMs <= 0 && !options.signal?.aborted) return;
    const signal = withDeadline(deadlineMs(options, this.settings), options.signal);
    try {
      await sleep(this.delayMs, signal);
    } catch (error) {
      throw new AiProviderError('respond', abortKind(error, signal) ?? 'aborted', null, null, null);
    }
  }
}

function marker(text: string): string | null {
  return MARKER.exec(text)?.[1] ?? null;
}

function isOneOf<T extends string>(value: string | null, values: readonly T[]): value is T {
  return value !== null && (values as readonly string[]).includes(value);
}

// The real provider in production only (A49, the owner's decision): development, tests and CI get
// the fake one whatever key the environment holds, so nothing but the site reaches OpenAI (AC27).
// Production without a key does not start (assertServerEnv, assertWorkerEnv).
export function createAiProvider(settings: AiSettings, logger: AiLogger): AiProvider {
  if (settings.nodeEnv !== 'production' || settings.apiKey === '') {
    return new FakeAiProvider(settings);
  }
  return new OpenAiProvider(
    new OpenAiClient({ apiKey: settings.apiKey, logger }),
    settings,
    logger,
  );
}
