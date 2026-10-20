import './globals.scss';

import type { Metadata } from 'next';
import { Onest } from 'next/font/google';
import type { ReactNode } from 'react';

import { Providers } from '@/_app';
import { Footer } from '@/widgets/footer';
import { Header } from '@/widgets/header';

// Downloaded at build time and served from our own domain; the tokens' --font-sans reads the variable.
const onest = Onest({ subsets: ['latin', 'cyrillic'], variable: '--font-onest' });

// A page's own title goes first (spec 0014 O25). `metadataBase` is set by the pages that render per
// request (O67): this metadata is built with the static pages, when no server env exists.
export const metadata: Metadata = {
  title: {
    template: '%s — Виртуальная примерка | Lamoda AI Fitting',
    default: 'Lamoda AI Fitting',
  },
};

// The frame shared by every page: providers, the site header and footer.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={onest.variable}>
      <body>
        <Providers>
          <Header />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
