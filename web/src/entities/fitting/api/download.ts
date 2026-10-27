import { BLOB_ANSWER, buildPath, clientFetch } from '@/shared/api';

// The name the browser saves under when the api's answer names none.
const FALLBACK_NAME = 'primerka.webp';

// How long the object URL lives after the click: a browser may start the save only after the
// click returns, so it is not revoked at once.
const REVOKE_AFTER_MS = 40_000;

// GET /fittings/:id/image (spec 0023 Y8, plan §4.3): the result's picture from the site's own
// origin, saved as a file through an object URL and an `<a download>` made on the call and never put
// into the page, so no tab opens and no link sits in the markup (A37). Errors are `ApiError`s,
// already reported.
export async function downloadFittingImage(id: string): Promise<void> {
  const { blob, fileName } = await clientFetch(
    buildPath('/fittings/:id/image', { id }),
    BLOB_ANSWER,
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName ?? FALLBACK_NAME;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
