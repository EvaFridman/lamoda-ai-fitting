import sharp from 'sharp';

import { type AiOperation, AiProviderError } from './ai-provider.error.js';
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
import { gptImage2 } from './image-models/gpt-image-2.js';
import {
  assertFittingItems,
  type FittingJob,
  type GenerationResult,
  type ImageModel,
} from './image-models/image-model.js';
import type { ImageInput } from './image-input.js';
import {
  type AiLogger,
  type CallOptions,
  type EditedImage,
  OpenAiClient,
} from './openai-client.js';

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
  // Whether the client tries a transient failure of a check again (three attempts, the default,
  // for a route); an activity with a retry policy of its own passes false (plan §4), so one call
  // is not repeated twice over. `generate` ignores it: the paid call repeats only what never
  // reached OpenAI (A67).
  retry?: boolean;
}

// What the routes and the activities see of the AI (spec 0019 plan §3): the checks and the
// generation. Each call runs under one deadline, the caller's own or else the settings' (the check
// deadline; the generation's `FITTING_TIMEOUT_SECONDS`), the caller's signal joined in; a deadline
// that passes throws an AiProviderError whose `isTimeout` is true. In a route (`POST /me/photos`,
// T4; `POST /fittings`, T12) that is a 503 with nothing stored (A45).
export interface AiProvider {
  // `openai`, what `aiProvider` stores (plan §3); `fake` where no key is set.
  readonly name: 'openai' | 'fake';
  // The image model's short name, what `aiModel` stores (A43): `FITTING_MODEL`.
  readonly model: string;
  checkPhoto(image: ImageInput, options?: AiCallOptions): Promise<PhotoCheck>;
  checkPrompt(text: string, options?: AiCallOptions): Promise<PromptCheck>;
  moderateImage(image: ImageInput, options?: AiCallOptions): Promise<ModerationResult>;
  // The one paid call (A28): one generation, one payment (A67). Whatever `retry` says, only a
  // request that surely never reached OpenAI is sent again (the client's `unsent`), and the
  // activity runs once. The model's refusal is a result, not an error; a timeout is
  // `model_timeout`, anything else thrown `provider_error` (plan §3).
  generate(job: FittingJob, options?: AiCallOptions): Promise<GenerationResult>;
}

// The real one: the three checkers and the image model over one OpenAiClient.
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly photos: PhotoChecker;
  private readonly prompts: PromptChecker;
  private readonly moderation: ModerationChecker;
  private readonly imageModel: ImageModel;

  constructor(
    private readonly client: OpenAiClient,
    private readonly settings: Pick<
      AiSettings,
      'model' | 'visionModel' | 'checkTimeoutMs' | 'timeoutSeconds'
    >,
    logger: AiLogger,
  ) {
    this.moderation = new ModerationChecker(client);
    this.photos = new PhotoChecker(client, this.moderation, settings.visionModel, logger);
    this.prompts = new PromptChecker(client, this.moderation, settings.visionModel, logger);
    this.imageModel = gptImage2(settings.model);
    this.model = this.imageModel.name;
  }

  async generate(job: FittingJob, options: AiCallOptions = {}): Promise<GenerationResult> {
    const call: CallOptions = {
      signal: withDeadline(
        deadlineMs(options, this.settings.timeoutSeconds * 1000),
        options.signal,
      ),
      retry: 'unsent',
    };
    let edited: EditedImage;
    try {
      edited = await this.client.editImage(this.imageModel.buildRequest(job), call);
    } catch (error) {
      if (error instanceof AiProviderError && this.imageModel.isRefusal(error)) {
        return { ok: false, reason: 'moderation', requestId: error.requestId };
      }
      throw error;
    }
    const image = this.imageModel.parseAnswer(edited.answer);
    return image === null
      ? { ok: false, reason: 'moderation', requestId: edited.requestId }
      : { ok: true, image, requestId: edited.requestId };
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
      signal: withDeadline(deadlineMs(options, this.settings.checkTimeoutMs), options.signal),
      retry: options.retry,
    };
  }
}

// The call's deadline: the caller's, when it is a time, else the fallback (the settings' check
// deadline, or the generation's).
export function deadlineMs(options: AiCallOptions, fallbackMs: number): number {
  const ms = options.timeoutMs;
  return ms !== undefined && Number.isFinite(ms) && ms >= 1 ? ms : fallbackMs;
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

  readonly model: string;

  constructor(
    private readonly settings: Pick<AiSettings, 'model' | 'checkTimeoutMs' | 'timeoutSeconds'>,
  ) {
    this.model = settings.model;
  }

  // The person's photo as the result, cut to the real model's size (a deterministic picture, so
  // the local stack and the e2e show a result with no file of their own). A marker `fail:<what>`
  // in the wishes or the comment (the photo reaches here re-encoded, A53) answers as the model
  // would: `fail:moderation` its refusal, `fail:provider_error` a 500 (transient, so the activity
  // retries it), `fail:timeout` the deadline passing, so a check by hand reaches every failure
  // screen.
  async generate(job: FittingJob, options: AiCallOptions = {}): Promise<GenerationResult> {
    assertFittingItems(job);
    await this.wait(options, 'edit_image', this.settings.timeoutSeconds * 1000);
    const failure = FAILURE_MARKER.exec(`${job.wishes ?? ''}\n${job.comment ?? ''}`)?.[1];
    if (failure === 'moderation') return { ok: false, reason: 'moderation', requestId: null };
    if (failure === 'provider_error') {
      throw new AiProviderError('edit_image', 'http', 500, 'server_error', null);
    }
    if (failure === 'timeout') throw new AiProviderError('edit_image', 'timeout', null, null, null);
    const image = await sharp(Buffer.from(job.person.bytes))
      .resize(FAKE_RESULT_WIDTH, FAKE_RESULT_HEIGHT, { fit: 'cover' })
      .webp()
      .toBuffer();
    return { ok: true, image: new Uint8Array(image), requestId: null };
  }

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
  private async wait(
    options: AiCallOptions,
    operation: AiOperation = 'respond',
    fallbackMs = this.settings.checkTimeoutMs,
  ): Promise<void> {
    if (this.delayMs <= 0 && !options.signal?.aborted) return;
    const signal = withDeadline(deadlineMs(options, fallbackMs), options.signal);
    try {
      await sleep(this.delayMs, signal);
    } catch (error) {
      throw new AiProviderError(operation, abortKind(error, signal) ?? 'aborted', null, null, null);
    }
  }
}

// The fake generation's failure marker (see FakeAiProvider.generate) and its picture's size, the
// real model's `1024x1536`.
const FAILURE_MARKER = /fail:([a-z_]+)/;
const FAKE_RESULT_WIDTH = 1024;
const FAKE_RESULT_HEIGHT = 1536;

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
