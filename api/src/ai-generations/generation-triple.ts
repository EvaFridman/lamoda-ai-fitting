import type { ErrorDetail } from '../common/errors/app.exception.js';
import type { GenerationStatus } from '../generated/prisma/enums.js';

export interface GenerationTriple {
  status: GenerationStatus;
  resultImageKey: string | null;
  errorMessage: string | null;
}

const CODE = 'MATCHES_STATUS';

// The rule of `ai_generations_status_check`, no stricter (spec 0004 E54): `pending` and
// `processing` have neither a result nor an error, `completed` has a result and no error, `failed`
// has an error and may have a result. Each broken part names its own field, so the caller gets a
// field-level 400 before the database (AC9). An empty list means the triple agrees.
export function checkGenerationTriple({
  status,
  resultImageKey,
  errorMessage,
}: GenerationTriple): ErrorDetail[] {
  const details: ErrorDetail[] = [];
  if (status === 'completed' && resultImageKey === null) {
    details.push({
      field: 'resultImageKey',
      code: CODE,
      message: 'resultImageKey is required when status is completed',
    });
  }
  if ((status === 'pending' || status === 'processing') && resultImageKey !== null) {
    details.push({
      field: 'resultImageKey',
      code: CODE,
      message: `resultImageKey must be null when status is ${status}`,
    });
  }
  if (status === 'failed' && errorMessage === null) {
    details.push({
      field: 'errorMessage',
      code: CODE,
      message: 'errorMessage is required when status is failed',
    });
  }
  if (status !== 'failed' && errorMessage !== null) {
    details.push({
      field: 'errorMessage',
      code: CODE,
      message: 'errorMessage must be null unless status is failed',
    });
  }
  return details;
}
