import { describe, expect, it } from 'vitest';

import { SITE_TITLE_TEMPLATE, siteTitle } from './site';

describe('siteTitle', () => {
  it('wraps a page title in the site title', () => {
    expect(siteTitle('Платья')).toBe('Платья — Виртуальная примерка | Lamoda AI Fitting');
  });

  it("gives the root layout a template around Next's placeholder", () => {
    expect(SITE_TITLE_TEMPLATE).toBe('%s — Виртуальная примерка | Lamoda AI Fitting');
  });
});
