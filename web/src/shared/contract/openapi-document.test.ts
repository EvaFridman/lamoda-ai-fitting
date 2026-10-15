import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { contractDiff } from './contract-diff';
import * as publicIndex from './index';
import { openApiDocument } from './openapi-document';

function errorCodeValues(): [string, ...string[]] {
  const component = openApiDocument().components.schemas.ErrorCode as { enum: string[] };
  return component.enum as [string, ...string[]];
}

describe('openApiDocument', () => {
  it('loads the committed api document with the ErrorCode enum', () => {
    const component = openApiDocument().components.schemas.ErrorCode as {
      type: string;
      enum: string[];
    };
    expect(component.type).toBe('string');
    expect(component.enum.length).toBeGreaterThan(0);
  });

  it('is importable through the public index under jsdom', () => {
    expect(typeof window).toBe('object');
    expect(typeof publicIndex.contractDiff).toBe('function');
    expect(typeof publicIndex.openApiDocument).toBe('function');
  });

  it('gives the same document on every call', () => {
    expect(openApiDocument()).toBe(openApiDocument());
  });

  describe('outside Vitest', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('refuses, even after the document is cached', () => {
      openApiDocument();
      vi.stubEnv('VITEST', undefined);
      expect(() => openApiDocument()).toThrow('openApiDocument() is for tests only');
    });

    it('works again once VITEST is back', () => {
      vi.stubEnv('VITEST', undefined);
      vi.unstubAllEnvs();
      expect(openApiDocument().components.schemas.ErrorCode).toBeDefined();
    });
  });
});

describe('contractDiff against the real document', () => {
  const check = (values: [string, ...string[]]) => ({
    name: 'errorCodeSchema',
    schema: z.enum(values),
    component: 'ErrorCode',
  });

  it('matches a z.enum of the ErrorCode values', () => {
    expect(contractDiff(openApiDocument(), check(errorCodeValues()))).toEqual([]);
  });

  it('names total and count when a list wrapper uses the wrong key', () => {
    const lines = contractDiff(openApiDocument(), {
      name: 'productListSchema',
      schema: z.object({ items: z.array(z.object({})), count: z.int() }),
      response: { method: 'get', path: '/products', status: '200' },
    });
    const label = 'productListSchema ↔ GET /products 200: ';
    expect(lines).toContain(`${label}total: in api, missing in web`);
    expect(lines).toContain(`${label}count: in web, not in api`);
  });

  it('reports a dropped value as missing in web', () => {
    const [dropped, ...rest] = errorCodeValues();
    expect(rest.length).toBeGreaterThan(0);
    const lines = contractDiff(openApiDocument(), check(rest as [string, ...string[]]));
    expect(lines).toEqual([
      `errorCodeSchema ↔ ErrorCode: (root): enum values missing in web: ${dropped}`,
    ]);
  });
});
