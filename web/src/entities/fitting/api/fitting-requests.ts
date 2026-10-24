import { buildPath, clientFetch } from '@/shared/api';

import {
  startedFittingSchema,
  type RegenerateFittingBody,
  type StartedFitting,
  type StartFittingBody,
} from '../model/schemas';

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// POST /fittings: the started fitting (201), or an earlier result of the same photo, items and
// wishes (`repeated`, A7) or the running one (A32), both 200. Errors are `ApiError`s, already
// reported; the caller shows them (409 `LIMIT_REACHED`, 400 `PROMPT_REFUSED`, the details
// `HAS_SLOT` and `DISTINCT_SLOTS`). Never retried: a start may spend a try-on.
export function startFitting(body: StartFittingBody): Promise<StartedFitting> {
  return clientFetch(buildPath('/fittings'), startedFittingSchema, jsonInit('POST', body));
}

// POST /fittings/:id/regenerate: a new result of the same photo, items and wishes (409
// `NOT_COMPLETED` for a parent not completed, `PHOTO_GONE` once its photo is deleted).
export function regenerateFitting(
  id: string,
  body: RegenerateFittingBody,
): Promise<StartedFitting> {
  return clientFetch(
    buildPath('/fittings/:id/regenerate', { id }),
    startedFittingSchema,
    jsonInit('POST', body),
  );
}

// DELETE /fittings/:id: a 204. A running one is cancelled and stays spent (A47).
export function deleteFitting(id: string): Promise<undefined> {
  return clientFetch(buildPath('/fittings/:id', { id }), null, { method: 'DELETE' });
}
