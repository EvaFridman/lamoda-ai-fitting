import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const search = vi.hoisted(() => ({ value: '' }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/customer/fittings',
  useSearchParams: () => new URLSearchParams(search.value),
  useRouter: () => router,
}));

const PRODUCT = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const fetchMock = vi.fn();

function quota(left: number) {
  return new Response(
    JSON.stringify({ limit: 20, used: 20 - left, left, renewsAt: '2026-10-31T21:00:00.000Z' }),
  );
}

function renderPage(Page: () => React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <Page />
    </QueryClientProvider>
  );
  const view = render(tree());
  // The address changed: a new element (the same one would bail out) reads the new search.
  return { ...view, navigate: () => view.rerender(tree()) };
}

beforeEach(() => {
  search.value = '';
  router.replace.mockReset();
  router.push.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(quota(5)));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('account stubs', () => {
  it.each([
    ['orders', OrdersPage, 'Мои заказы'],
    ['stores', StoresPage, 'Магазины'],
    ['fittings', FittingsPage, 'Мои примерки'],
  ] as const)('the %s stub shows its title and that it is coming', (_name, Page, title) => {
    renderPage(Page);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText('Раздел скоро появится')).toBeInTheDocument();
  });
});

describe('the try-on entry on the fittings stub', () => {
  it('shows nothing extra without a product or a fitting in the address', () => {
    renderPage(FittingsPage);

    expect(screen.queryByRole('button', { name: 'Примерить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows «Примерить» for a product in the address', async () => {
    search.value = `product=${PRODUCT}`;
    renderPage(FittingsPage);

    expect(await screen.findByRole('button', { name: 'Примерить' })).toBeEnabled();
  });

  it('ignores a product that is not an id', () => {
    search.value = 'product=not-an-id';
    renderPage(FittingsPage);

    expect(screen.queryByRole('button', { name: 'Примерить' })).not.toBeInTheDocument();
  });

  it('turns the button off at no tries left and says when they come back (AC19)', async () => {
    search.value = `product=${PRODUCT}`;
    fetchMock.mockImplementation(() => Promise.resolve(quota(0)));
    renderPage(FittingsPage);

    expect(await screen.findByText('Примерки снова будут доступны 1 ноября')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Примерить' })).toBeDisabled();
  });

  it('opens the try-on window at once for a fitting in the address', async () => {
    search.value = 'fitting=3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
    renderPage(FittingsPage);

    expect(await screen.findByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
  });

  it('opens the window from the button', async () => {
    search.value = `product=${PRODUCT}`;
    renderPage(FittingsPage);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Примерить' }));

    expect(await screen.findByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
  });

  it('on closing a fitting window replaces the address without `fitting`, keeping `product`', async () => {
    search.value = `fitting=${PRODUCT}&product=${PRODUCT}`;
    renderPage(FittingsPage);
    await screen.findByRole('dialog', { name: 'Онлайн-примерка' });

    await userEvent.setup().keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(
      `/customer/fittings?product=${PRODUCT}`,
      {
        scroll: false,
      },
    );
  });

  it('on closing a fitting window with no other parameter replaces the address with the bare path', async () => {
    search.value = `fitting=${PRODUCT}`;
    renderPage(FittingsPage);
    await screen.findByRole('dialog', { name: 'Онлайн-примерка' });

    await userEvent.setup().keyboard('{Escape}');

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace).toHaveBeenCalledWith('/customer/fittings', { scroll: false });
  });

  it('does not touch the address when a window opened by the button closes', async () => {
    search.value = `product=${PRODUCT}`;
    renderPage(FittingsPage);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Примерить' }));
    await screen.findByRole('dialog', { name: 'Онлайн-примерка' });

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the window again when a link to the same fitting follows its close', async () => {
    search.value = `fitting=${PRODUCT}`;
    const page = renderPage(FittingsPage);
    await screen.findByRole('dialog', { name: 'Онлайн-примерка' });
    await userEvent.setup().keyboard('{Escape}');
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));

    search.value = '';
    page.navigate();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    search.value = `fitting=${PRODUCT}`;
    page.navigate();

    expect(await screen.findByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
  });
});
