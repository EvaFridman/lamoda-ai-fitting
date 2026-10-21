import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AccountDataPage } from './account-data-page';

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
  usePathname: () => '/customer/account',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('AccountDataPage', () => {
  it('shows its title and nothing else in the section', () => {
    render(<AccountDataPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Мои данные' })).toBeInTheDocument();
    expect(screen.queryByText('Раздел скоро появится')).not.toBeInTheDocument();
    expect(screen.getByRole('main').querySelectorAll('p, form, input, button')).toHaveLength(0);
  });
});
