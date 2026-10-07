import './globals.scss';

import type { Metadata } from 'next';
import { Onest } from 'next/font/google';
import type { ReactNode } from 'react';

import { Providers } from '@/_app';
import { Footer } from '@/widgets/footer';

// Downloaded at build time and served from our own domain; the tokens' --font-sans reads the variable.
const onest = Onest({ subsets: ['latin', 'cyrillic'], variable: '--font-onest' });

export const metadata: Metadata = {
  title: 'Lamoda AI Fitting',
};

// The frame shared by every page: providers and the site footer.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={onest.variable}>
      <body>
        <Providers>
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
