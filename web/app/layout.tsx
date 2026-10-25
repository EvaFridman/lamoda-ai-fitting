import './globals.scss';

import type { Metadata } from 'next';
import { Onest } from 'next/font/google';
import { type ReactNode, Suspense } from 'react';

import { Providers } from '@/_app';
import { SITE_NAME, SITE_TITLE_TEMPLATE } from '@/shared/config';
import { FittingRoomDrawer } from '@/widgets/fitting-room-drawer';
import { Footer } from '@/widgets/footer';
import { Header } from '@/widgets/header';
import { LookTryOn } from '@/widgets/try-on';

// Downloaded at build time and served from our own domain; the tokens' --font-sans reads the variable.
const onest = Onest({ subsets: ['latin', 'cyrillic'], variable: '--font-onest' });

// A page's own title goes first (spec 0014 O25). `metadataBase` is set by the pages that render per
// request (O67): this metadata is built with the static pages, when no server env exists.
export const metadata: Metadata = {
  title: { template: SITE_TITLE_TEMPLATE, default: SITE_NAME },
};

// The frame shared by every page: providers, the site header and footer, the fitting room's
// drawer, which the header and the pages open (spec 0019 A90.7), and the look's try-on, which the
// drawer opens (T26).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={onest.variable}>
      <body>
        <Providers>
          <Header />
          {children}
          <Footer />
          {/* It reads the path (`usePathname`): its own boundary, or a dynamic route's build fails. */}
          <Suspense fallback={null}>
            <FittingRoomDrawer />
            <LookTryOn />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
