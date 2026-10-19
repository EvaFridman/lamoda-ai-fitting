import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api';
import { Menu, ToastProvider } from '@/shared/ui';

import { SignOutItems } from './sign-out-items';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  signOutEverywhere: vi.fn(),
  reportFailure: vi.fn(),
}));

vi.mock('../model/auth-actions', () => ({
  signOut: mocks.signOut,
  signOutEverywhere: mocks.signOutEverywhere,
}));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  reportFailure: mocks.reportFailure,
}));

async function openMenu() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(
    <ToastProvider>
      <Menu trigger={<button type="button">Профиль</button>}>
        <SignOutItems />
      </Menu>
    </ToastProvider>,
  );
  const trigger = screen.getByRole('button', { name: 'Профиль' });
  await vi.waitFor(async () => {
    if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
  return user;
}

describe('SignOutItems', () => {
  beforeEach(() => {
    mocks.signOut.mockReset().mockResolvedValue(undefined);
    mocks.signOutEverywhere.mockReset().mockResolvedValue(undefined);
    mocks.reportFailure.mockReset();
  });

  it('lists "Выйти" and "Выйти со всех устройств" in this order', async () => {
    await openMenu();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Выйти',
      'Выйти со всех устройств',
    ]);
  });

  it('signs out this browser by "Выйти"', async () => {
    const user = await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Выйти' }));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOutEverywhere).not.toHaveBeenCalled();
  });

  it('signs out everywhere by "Выйти со всех устройств"', async () => {
    const user = await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Выйти со всех устройств' }));
    expect(mocks.signOutEverywhere).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('shows no toast when the sign-out works', async () => {
    const user = await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Выйти' }));
    expect(screen.queryByRole('region', { name: 'Уведомления' })?.textContent ?? '').toBe('');
    expect(mocks.reportFailure).not.toHaveBeenCalled();
  });

  it('shows the error text in a toast and reports when the sign-out fails', async () => {
    const failure = new ApiError('m', {
      kind: 'http',
      template: '/api/auth/sign-out',
      method: 'POST',
      status: 503,
    });
    mocks.signOut.mockRejectedValue(failure);
    const user = await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Выйти' }));
    const region = await screen.findByRole('region', { name: 'Уведомления' });
    expect(
      await within(region).findByText('Сервис временно недоступен, попробуйте позже'),
    ).toBeInTheDocument();
    expect(mocks.reportFailure).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it('shows the toast when signing out everywhere fails', async () => {
    mocks.signOutEverywhere.mockRejectedValue(new Error('boom'));
    const user = await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Выйти со всех устройств' }));
    const region = await screen.findByRole('region', { name: 'Уведомления' });
    expect(
      await within(region).findByText('Что-то пошло не так, попробуйте позже'),
    ).toBeInTheDocument();
  });
});
