'use client';

import { useDropSignInError } from '../model/use-drop-sign-in-error';

// For a signed-in visitor: only drops a failed sign-in's code from the address (spec 0013 N54).
// Render it per request inside <Suspense>.
export function DropSignInError() {
  useDropSignInError();
  return null;
}
