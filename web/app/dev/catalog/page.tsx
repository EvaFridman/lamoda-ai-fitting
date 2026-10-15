import type { Metadata } from 'next';

// Public in production, linked from nowhere and closed to search engines (spec 0007, H14), as
// /ui-kit: renders <meta name="robots" content="noindex, nofollow">.
export const metadata: Metadata = {
  title: 'Каталог: слой данных — Lamoda AI Fitting',
  robots: { index: false, follow: false },
};

export { DevCatalogPage as default } from '@/_pages/dev-catalog';
