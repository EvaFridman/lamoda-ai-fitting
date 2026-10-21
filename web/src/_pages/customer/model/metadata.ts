import type { Metadata } from 'next';

import { type AccountSection, accountSections } from '@/shared/config';

// Every account page is closed to search engines (spec 0017 U12, AC3): the layout of
// `app/customer/` renders <meta name="robots" content="noindex, nofollow"> on all of them. A
// section's title goes through the template; `/customer`, the layout's own segment, gets the
// default.
export const accountLayoutMetadata: Metadata = {
  title: {
    template: '%s — Lamoda AI Fitting',
    default: 'Личный кабинет — Lamoda AI Fitting',
  },
  robots: { index: false, follow: false },
};

/** A section page's metadata: its title, the same as in the menus. */
export function accountSectionMetadata(section: AccountSection['section']): Metadata {
  const entry = accountSections.find((candidate) => candidate.section === section);
  return { title: entry?.title };
}
