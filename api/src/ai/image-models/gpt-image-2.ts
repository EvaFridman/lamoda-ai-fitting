import type { AiProviderError } from '../ai-provider.error.js';
import type { ImageInput } from '../image-input.js';
import type { ImagesAnswer } from '../openai-client.js';
import { fittingPrompt } from '../prompts.js';
import { assertFittingItems, type FittingJob, type ImageModel } from './image-model.js';

// The fixed settings of the request (plan §3, A17): no env variable moves them.
export const GPT_IMAGE_QUALITY = 'medium';
export const GPT_IMAGE_SIZE = '1024x1536';

// `error.code`s of an edits request the model's content policy refused: a 400, not worth another
// attempt, shown as moderation (A15).
const REFUSAL_CODES: ReadonlySet<string> = new Set([
  'moderation_blocked',
  'content_policy_violation',
]);

const EXTENSIONS: Readonly<Record<ImageInput['mimeType'], string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// GPT-Image-2 on the edits endpoint (A17). `FITTING_MODEL` may name `gpt-image-2.5-sunburst`,
// which takes the same request, so the name is the setting's.
export function gptImage2(name: string): ImageModel {
  return {
    name,

    buildRequest(job: FittingJob): FormData {
      assertFittingItems(job);
      const form = new FormData();
      form.set('model', name);
      form.set('prompt', fittingPrompt(job));
      // The person first, then the items in the prompt's order (plan §3).
      form.append('image[]', file(job.person, 'person'));
      job.items.forEach((item, index) => {
        form.append('image[]', file(item.image, `item-${index + 1}`));
      });
      form.set('quality', GPT_IMAGE_QUALITY);
      form.set('size', GPT_IMAGE_SIZE);
      form.set('output_format', 'webp');
      // No `moderation` (only /v1/images/generations takes it; the edits endpoint filters by its
      // default) and no `input_fidelity` (gpt-image-2 refuses it, always high), A67.
      form.set('n', '1');
      return form;
    },

    parseAnswer(answer: ImagesAnswer): Uint8Array | null {
      const encoded = answer.data[0]?.b64_json;
      if (encoded === undefined || encoded === '') return null;
      const bytes = Buffer.from(encoded, 'base64');
      return bytes.length === 0 ? null : new Uint8Array(bytes);
    },

    isRefusal(error: AiProviderError): boolean {
      return (
        error.operation === 'edit_image' &&
        error.status === 400 &&
        error.code !== null &&
        REFUSAL_CODES.has(error.code)
      );
    },
  };
}

function file(image: ImageInput, stem: string): File {
  return new File([Buffer.from(image.bytes)], `${stem}.${EXTENSIONS[image.mimeType]}`, {
    type: image.mimeType,
  });
}
