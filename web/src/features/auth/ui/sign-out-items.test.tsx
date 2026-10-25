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
  track: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/shared/analytics/client', () => ({ track: mocks.track, reset: mocks.reset }));

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
    mocks.track.mockReset();
    mocks.reset.mockReset();
  });

  describe('analytics (spec 0013 N13)', () => {
    it.each([
      ['Выйти', 'profile-menu.sign-out'],
      ['Выйти со всех устройств', 'profile-menu.sign-out-everywhere'],
    ] as const)(
      'tracks the click on "%s", then Signed Out and the identity reset after success',
      async (name, element) => {
        const user = await openMenu();
        await user.click(screen.getByRole('menuitem', { name }));
        // Longer than the default 1 s: the full verify runs the api and web tests at once.
        await vi.waitFor(() => expect(mocks.reset).toHaveBeenCalledTimes(1), { timeout: 5000 });
        expect(mocks.track.mock.calls).toEqual([
          ['Element Clicked', { element, zone: 'auth', type: 'interaction', surface: 'menu' }],
          ['Signed Out', {}],
        ]);
        expect(mocks.track.mock.invocationCallOrder[1]).toBeLessThan(
          mocks.reset.mock.invocationCallOrder[0] ?? 0,
        );
      },
      15_000,
    );

    it.each([
      ['Выйти', 'signOut', 'profile-menu.sign-out'],
      ['Выйти со всех устройств', 'signOutEverywhere', 'profile-menu.sign-out-everywhere'],
    ] as const)(
      'sends no Signed Out and keeps the identity when "%s" fails, and still shows the toast',
      async (name, action, element) => {
        mocks[action].mockRejectedValue(new Error('boom'));
        const user = await openMenu();
        await user.click(screen.getByRole('menuitem', { name }));
        const region = await screen.findByRole(
          'region',
          { name: 'Уведомления' },
          { timeout: 5000 },
        );
        expect(
          await within(region).findByText('Что-то пошло не так, попробуйте позже'),
        ).toBeInTheDocument();
        expect(mocks.track.mock.calls).toEqual([
          ['Element Clicked', { element, zone: 'auth', type: 'interaction', surface: 'menu' }],
        ]);
        expect(mocks.reset).not.toHaveBeenCalled();
      },
      15_000,
    );

    it('tracks a hover of 500 ms on "Выйти"', async () => {
      const user = await openMenu();
      await user.hover(screen.getByRole('menuitem', { name: 'Выйти' }));
      await vi.waitFor(
        () =>
          expect(mocks.track).toHaveBeenCalledWith('Element Hovered', {
            element: 'profile-menu.sign-out',
            zone: 'auth',
            type: 'interaction',
            surface: 'menu',
          }),
        { timeout: 3000 },
      );
    });
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
    const region = await screen.findByRole('region', { name: 'Уведомления' }, { timeout: 5000 });
    expect(
      await within(region).findByText('Сервис временно недоступен, попробуйте позже'),
    ).toBeInTheDocument();
    expect(mocks.reportFailure).toHaveBeenCalledExactlyOnceWith(failure);
  }, 15_000);

  it('shows the toast when signing out everywhere fails', async () => {
    mocks.signOutEverywhere.mockRejectedValue(new Error('boom'));
    const user = await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Выйти со всех устройств' }));
    const region = await screen.findByRole('region', { name: 'Уведомления' }, { timeout: 5000 });
    expect(
      await within(region).findByText('Что-то пошло не так, попробуйте позже'),
    ).toBeInTheDocument();
  }, 15_000);
});
