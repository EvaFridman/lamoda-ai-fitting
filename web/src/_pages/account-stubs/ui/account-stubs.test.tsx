import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OrdersPage } from './account-stubs';

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
  usePathname: () => '/customer/orders',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

function renderPage(Page: () => React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Page />
    </QueryClientProvider>,
  );
}

describe('account stubs', () => {
  it('the orders stub shows its title and that it is coming', () => {
    renderPage(OrdersPage);
    expect(screen.getByRole('heading', { level: 1, name: 'Мои заказы' })).toBeInTheDocument();
    expect(screen.getByText('Раздел скоро появится')).toBeInTheDocument();
  });
});
