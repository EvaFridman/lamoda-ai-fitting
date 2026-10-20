import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let codes: readonly string[] | undefined;

// The `details` codes of the api's DTO rules, its committed snapshot (spec 0017 U15;
// api/test/validation-codes.e2e-spec.ts keeps it current). Read like openApiDocument(): at test
// time, from a path off `import.meta.dirname`.
export function validationCodes(): readonly string[] {
  // Test-only (H18): ESLint refuses static imports elsewhere; this catches the rest.
  if (process.env.VITEST === undefined) {
    throw new Error('validationCodes() is for tests only');
  }
  codes ??= JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../../api/validation-codes.json'), 'utf8'),
  ) as string[];
  return codes;
}
