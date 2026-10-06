import './globals.scss';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/_app';
import { Footer } from '@/widgets/footer';

export const metadata: Metadata = {
  title: 'Lamoda AI Fitting',
};

// The frame shared by every page: providers and the site footer.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
