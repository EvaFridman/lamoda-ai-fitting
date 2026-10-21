import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { accountLayoutMetadata } from '@/_pages/customer';

// The account (spec 0017): every page under it is `noindex` (U12).
export const metadata: Metadata = accountLayoutMetadata;

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return children;
}
