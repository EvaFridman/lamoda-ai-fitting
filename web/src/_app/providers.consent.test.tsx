import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Providers } from './providers';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/shared/config', () => ({ analyticsEnabled: true }));
vi.mock('@/shared/analytics/client', () => ({
  track: vi.fn(),
  startAnalytics: vi.fn(),
  stopAnalytics: vi.fn(),
}));

describe('Providers', () => {
  it('renders the consent banner before the page content', () => {
    render(
      <Providers>
        <main>page</main>
      </Providers>,
    );
    const banner = screen.getByRole('region', { name: 'Согласие на cookies' });
    const page = screen.getByRole('main');
    expect(banner.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
