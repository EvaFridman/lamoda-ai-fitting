import type { ErrorDetail } from '../common/errors/app.exception.js';
import type { FittingFailure, GenerationStatus } from '../generated/prisma/enums.js';

export interface GenerationTriple {
  status: GenerationStatus;
  resultImageKey: string | null;
  errorMessage: string | null;
  // The stored row's: the closed route never writes it (spec 0019 plan §2). Left out, none.
  failureCode?: FittingFailure | null;
}

const CODE = 'MATCHES_STATUS';

// The rule of `ai_generations_status_check`, no stricter (spec 0004 E54, spec 0019 plan §2):
// `pending` and `processing` have neither a result nor a failure, `completed` has a result and no
// failure, `failed` has an error message or a failure code and may have a result. Each broken part
// names its own field (a failure code, which no body sets, names `status`), so the caller gets a
// field-level 400 before the database (AC9). An empty list means the triple agrees.
export function checkGenerationTriple({
  status,
  resultImageKey,
  errorMessage,
  failureCode = null,
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
  if (status === 'failed' && errorMessage === null && failureCode === null) {
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
  if (status !== 'failed' && failureCode !== null) {
    details.push({
      field: 'status',
      code: CODE,
      message: 'status must stay failed: the generation has a failure code',
    });
  }
  return details;
}
