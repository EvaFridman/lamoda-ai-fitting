'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Last-resort error screen: replaces the root layout when it fails to render. Reports the error to
// Sentry (React render errors do not reach onRequestError).
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body>
        {/* Own line height: globals.scss may still be loaded, and its body sets an absolute 20px. */}
        <main
          style={{
            padding: '2rem',
            fontFamily: 'system-ui, sans-serif',
            lineHeight: 1.2,
            textAlign: 'center',
          }}
        >
          <h1>Что-то пошло не так</h1>
          <p>Мы уже знаем об ошибке. Попробуйте обновить страницу.</p>
        </main>
      </body>
    </html>
  );
}
