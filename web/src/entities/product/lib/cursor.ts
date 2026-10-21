import { ApiError } from '@/shared/api';

// The list's answer to a cursor it does not take (malformed, another sort's, empty: spec 0014 O54):
// 400 with a detail on `cursor`. The catalog then shows the first batch instead (O72).
export function isRefusedCursor(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.kind === 'http' &&
    error.status === 400 &&
    error.details.some((detail) => detail.field === 'cursor' && detail.code === 'INVALID_CURSOR')
  );
}
