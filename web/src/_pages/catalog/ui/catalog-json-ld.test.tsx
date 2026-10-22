import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ SITE_URL: 'https://site.test' }),
}));

import { CatalogJsonLd, type CatalogJsonLdProps } from './catalog-json-ld';

function props(nonce: string | undefined): CatalogJsonLdProps {
  return {
    nonce,
    breadcrumbs: [{ name: 'Каталог', path: '/catalog' }],
    products: [],
    isCatalogRoot: true,
  };
}

describe('CatalogJsonLd', () => {
  it('renders the nonce on the script when given', () => {
    const html = renderToStaticMarkup(<CatalogJsonLd {...props('abc123==')} />);
    expect(html).toMatch(/^<script [^>]*type="application\/ld\+json"/);
    expect(html).toContain('nonce="abc123=="');
  });

  it('renders no nonce attribute without one', () => {
    const html = renderToStaticMarkup(<CatalogJsonLd {...props(undefined)} />);
    expect(html).not.toContain('nonce');
  });
});
