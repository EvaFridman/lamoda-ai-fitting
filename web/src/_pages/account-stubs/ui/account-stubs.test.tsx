import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FittingsPage, OrdersPage, StoresPage } from './account-stubs';

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => ({
    status: 'signed-in',
    user: { id: 'u1', email: 'a@example.com', name: null },
  }),
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  track: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/customer',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('account stubs', () => {
  it.each([
    ['orders', OrdersPage, 'Мои заказы'],
    ['stores', StoresPage, 'Магазины'],
    ['fittings', FittingsPage, 'Мои примерки'],
  ] as const)('the %s stub shows its title and that it is coming', (_name, Page, title) => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText('Раздел скоро появится')).toBeInTheDocument();
  });
});
