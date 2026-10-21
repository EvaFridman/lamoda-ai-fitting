import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CustomerPage } from './customer-page';

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => ({ status: 'pending' }),
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

describe('CustomerPage', () => {
  it('shows the title and the four section links, no section content', () => {
    render(<CustomerPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Личный кабинет' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
