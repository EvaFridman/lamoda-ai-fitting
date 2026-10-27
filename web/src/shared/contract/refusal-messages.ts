import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** One refusal's detail as the api answers it: the field, the reason and its message. */
export interface RefusalMessage {
  field: string;
  reason: string;
  message: string;
}

export interface RefusalMessages {
  PHOTO_REFUSED: RefusalMessage[];
  PROMPT_REFUSED: RefusalMessage[];
}

let messages: RefusalMessages | undefined;

// Every refusal detail's message the api can answer, its committed snapshot (spec 0023 plan §3.5;
// api/test/refusal-messages.e2e-spec.ts keeps it current). Read like validationCodes().
export function refusalMessages(): RefusalMessages {
  // Test-only (H18): ESLint refuses static imports elsewhere; this catches the rest.
  if (process.env.VITEST === undefined) {
    throw new Error('refusalMessages() is for tests only');
  }
  messages ??= JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../../api/refusal-messages.json'), 'utf8'),
  ) as RefusalMessages;
  return messages;
}
