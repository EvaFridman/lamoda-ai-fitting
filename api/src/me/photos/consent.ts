import type { ErrorDetail } from '../../common/errors/app.exception.js';

// The version of the fitting photo consents' text (spec 0023 plan §3.1, Y1): web sends it as the
// upload's `consent` field once both boxes are checked, and the user's row keeps it. A changed text
// raises it, so every user gives the consents again.
export const PHOTO_CONSENT_VERSION = 1;

export const CONSENT_FIELD = 'consent';

// The user has no stored consent of the current version and the upload sent none (Y17): web shows
// the consents again (a stale tab).
export function consentRequired(): ErrorDetail {
  return {
    field: CONSENT_FIELD,
    code: 'CONSENT_REQUIRED',
    message: `${CONSENT_FIELD} must be given before the first upload`,
  };
}

// Whether the stored version covers the current text.
export function hasConsent(storedVersion: number | null): boolean {
  return storedVersion !== null && storedVersion >= PHOTO_CONSENT_VERSION;
}
