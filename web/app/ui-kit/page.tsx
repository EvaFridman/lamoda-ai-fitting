import type { Metadata } from 'next';

// Public in production, closed to search engines (spec 0003, D10): renders
// <meta name="robots" content="noindex, nofollow">.
export const metadata: Metadata = {
  title: 'UI-kit — Lamoda AI Fitting',
  robots: { index: false, follow: false },
};

export { UiKitPage as default } from '@/_pages/ui-kit';
