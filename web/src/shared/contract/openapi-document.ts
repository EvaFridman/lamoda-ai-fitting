import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { OpenApiDocument } from './contract-diff';

let document: OpenApiDocument | undefined;

// The api's committed OpenAPI snapshot (api/test/openapi-snapshot.e2e-spec.ts keeps it current).
// Read at test time, not imported: the web image builds without the api folder. A path from
// `import.meta.dirname`, not `import.meta.url`: under jsdom the latter is not a file: URL.
export function openApiDocument(): OpenApiDocument {
  // Test-only (H18): ESLint refuses static imports elsewhere; this catches the rest.
  if (process.env.VITEST === undefined) {
    throw new Error('openApiDocument() is for tests only');
  }
  document ??= JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../../api/openapi.json'), 'utf8'),
  ) as OpenApiDocument;
  return document;
}
