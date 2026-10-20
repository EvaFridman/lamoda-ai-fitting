import { afterEach, describe, expect, it, vi } from 'vitest';

import * as publicIndex from './index';
import { validationCodes } from './validation-codes';

describe('validationCodes', () => {
  it('loads a non-empty, sorted, duplicate-free list of UPPER_SNAKE codes', () => {
    const codes = validationCodes();
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
    }
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes]).toEqual([...codes].sort());
  });

  it('is importable through the public index under jsdom', () => {
    expect(typeof window).toBe('object');
    expect(typeof publicIndex.validationCodes).toBe('function');
  });

  it('gives the same array on every call', () => {
    expect(validationCodes()).toBe(validationCodes());
  });

  describe('outside Vitest', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('refuses, even after the list is cached', () => {
      validationCodes();
      vi.stubEnv('VITEST', undefined);
      expect(() => validationCodes()).toThrow('validationCodes() is for tests only');
    });

    it('works again once VITEST is back', () => {
      vi.stubEnv('VITEST', undefined);
      vi.unstubAllEnvs();
      expect(validationCodes().length).toBeGreaterThan(0);
    });
  });
});
