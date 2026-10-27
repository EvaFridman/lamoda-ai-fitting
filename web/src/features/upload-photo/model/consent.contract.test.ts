import { describe, expect, it } from 'vitest';

import { openApiDocument } from '@/shared/contract';

import { PHOTO_CONSENT_VERSION } from './consent';

type Json = Record<string, unknown>;

function resolve(document: Json, node: unknown): Json {
  const ref = (node as Json | undefined)?.$ref;
  if (typeof ref !== 'string') return node as Json;
  let target: unknown = document;
  for (const part of ref.replace(/^#\//, '').split('/')) target = (target as Json)[part];
  return target as Json;
}

describe('the photo consents version (spec 0023 Y1)', () => {
  it('is the one POST /me/photos takes', () => {
    const document = openApiDocument() as unknown as Json;
    const post = ((document.paths as Json)['/me/photos'] as Json).post as Json;
    const content = (post.requestBody as Json).content as Json;
    const schema = resolve(document, (content['multipart/form-data'] as Json).schema);
    const consent = resolve(document, (schema.properties as Json).consent);

    expect(consent.enum).toEqual([PHOTO_CONSENT_VERSION]);
  });
});
