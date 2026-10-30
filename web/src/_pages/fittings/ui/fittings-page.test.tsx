import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FittingsPage } from './fittings-page';

const mocks = vi.hoisted(() => ({
  session: { status: 'signed-in', user: { id: 'u1', email: 'a@example.com', name: null } } as
    | { status: 'signed-in'; user: { id: string; email: string; name: string | null } }
    | { status: 'signed-out'; failed: boolean },
  search: { value: '' },
  router: { replace: vi.fn(), push: vi.fn() },
}));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  track: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/customer/fittings',
  useSearchParams: () => new URLSearchParams(mocks.search.value),
  useRouter: () => mocks.router,
}));

const PRODUCT = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const FITTING_ID = '7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d';
const fetchMock = vi.fn();

const json = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }),
  );

function quota(left: number) {
  return json({
    limit: 20,
    used: 20 - left,
    left,
    renewsAt: '2026-10-31T21:00:00.000Z',
    unseen: 0,
  });
}

const listed = {
  id: FITTING_ID,
  kind: 'single',
  parentId: null,
  status: 'completed',
  stage: 'done',
  failureCode: null,
  failureCategory: null,
  failureStage: null,
  countsAgainstLimit: true,
  regenerationFree: true,
  model: 'gpt-image-2',
  items: [
    {
      productId: PRODUCT,
      name: 'Рубашка Annen',
      brand: 'Annen',
      imageUrl: null,
      price: 1000,
      finalPrice: 900,
      attributeValueId: null,
      colour: 'белый',
      slot: 'top',
    },
  ],
  promptText: null,
  photoId: null,
  photoTransient: null,
  resultUrl: null,
  createdAt: '2026-10-23T11:06:00.000Z',
  startedAt: null,
  finishedAt: null,
  estimatedSeconds: null,
};

// Answers the quota and the list; anything else (the try-on window's reads) gets the quota too.
function api(left: number, items: unknown[] = []) {
  fetchMock.mockImplementation((url: unknown) => {
    const { pathname } = new URL(String(url));
    if (pathname === '/api/fittings/seen')
      return Promise.resolve(new Response(null, { status: 204 }));
    if (pathname === '/api/fittings') {
      return json({ items, total: items.length, nextCursor: null });
    }
    return quota(left);
  });
}

function seenPosts() {
  return fetchMock.mock.calls.filter(
    ([url, init]) =>
      init?.method === 'POST' && new URL(String(url)).pathname === '/api/fittings/seen',
  );
}

function renderPage(prime?: (queryClient: QueryClient) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  prime?.(queryClient);
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <FittingsPage />
    </QueryClientProvider>
  );
  const view = render(tree());
  // The address changed: a new element (the same one would bail out) reads the new search.
  return { ...view, queryClient, navigate: () => view.rerender(tree()) };
}

beforeEach(() => {
  mocks.search.value = '';
  mocks.session = { status: 'signed-in', user: { id: 'u1', email: 'a@example.com', name: null } };
  mocks.router.replace.mockReset();
  mocks.router.push.mockReset();
  fetchMock.mockReset();
  api(5);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('the fittings page', () => {
  it('is no stub: it shows its title and the history', async () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Мои примерки' })).toBeInTheDocument();
    expect(await screen.findByText('Здесь появятся ваши примерки')).toBeInTheDocument();
    expect(screen.queryByText('Раздел скоро появится')).not.toBeInTheDocument();
  });

  it('shows the limit under the menu with the renewal date', async () => {
    renderPage();

    expect(await screen.findByText('Осталось 5 из 20 примерок в этом месяце')).toBeInTheDocument();
    expect(screen.getByText('Обновится 1 ноября')).toBeInTheDocument();
  });

  it('says that the tries are over at none left', async () => {
    api(0);
    renderPage();

    expect(await screen.findByText('Примерки закончились')).toBeInTheDocument();
  });

  it('reads neither the history nor the limit when signed out', () => {
    mocks.session = { status: 'signed-out', failed: false };
    renderPage();

    expect(screen.getByText('Войдите, чтобы открыть личный кабинет')).toBeInTheDocument();
    expect(screen.queryByText(/Осталось/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens a fitting of the list in the try-on window through the address', async () => {
    api(5, [listed]);
    renderPage();

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Открыть примерку' }));

    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith(
      `/customer/fittings?fitting=${FITTING_ID}`,
      { scroll: false },
    );
  });

  it('keeps the other parameters of the address when it opens a fitting', async () => {
    window.history.replaceState(null, '', '/customer/fittings?from=history');
    api(5, [listed]);
    renderPage();

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Открыть примерку' }));

    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith(
      `/customer/fittings?from=history&fitting=${FITTING_ID}`,
      { scroll: false },
    );
  });
});

describe('the fittings page marks the results as seen (spec 0024 AC30)', () => {
  it('sends POST /fittings/seen once when opened signed in', async () => {
    const page = renderPage();

    await vi.waitFor(() => expect(seenPosts()).toHaveLength(1));
    page.navigate();
    await screen.findByText('Здесь появятся ваши примерки');
    expect(seenPosts()).toHaveLength(1);
  });

  it('marks again when the page mounts again', async () => {
    const first = renderPage();
    await vi.waitFor(() => expect(seenPosts()).toHaveLength(1));
    first.unmount();

    renderPage();

    await vi.waitFor(() => expect(seenPosts()).toHaveLength(2));
  });

  it('makes the header’s cached count 0 shortly, while the api has not answered', async () => {
    fetchMock.mockImplementation((url: unknown) => {
      const { pathname } = new URL(String(url));
      return pathname === '/api/fittings/seen' || pathname === '/api/me/fitting-quota'
        ? new Promise<Response>(() => undefined)
        : json({ items: [], total: 0, nextCursor: null });
    });

    const page = renderPage((queryClient) =>
      queryClient.setQueryData(['users', 'fittings', 'quota'], {
        limit: 20,
        used: 3,
        left: 17,
        renewsAt: '2026-10-31T21:00:00.000Z',
        unseen: 4,
      }),
    );

    await vi.waitFor(() => expect(seenPosts()).toHaveLength(1));
    expect(
      page.queryClient.getQueryData<{ unseen: number }>(['users', 'fittings', 'quota'])?.unseen,
    ).toBe(0);
  });

  it('reads the quota again after the answer, for the real count', async () => {
    let invalidate = vi.fn();
    renderPage((queryClient) => {
      invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    });

    await vi.waitFor(() => expect(seenPosts()).toHaveLength(1));
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users', 'fittings', 'quota'] }),
    );
  });

  it('sends nothing signed out', async () => {
    mocks.session = { status: 'signed-out', failed: false };
    renderPage();

    await screen.findByText('Войдите, чтобы открыть личный кабинет');
    expect(seenPosts()).toHaveLength(0);
  });

  it('shows the meter when the first quota read is cancelled and the mark fails', async () => {
    let quotaReads = 0;
    fetchMock.mockImplementation((url: unknown) => {
      const { pathname } = new URL(String(url));
      if (pathname === '/api/fittings/seen') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: 'NOT_FOUND', message: 'm', details: [] } }),
            { status: 404 },
          ),
        );
      }
      if (pathname === '/api/fittings') return json({ items: [], total: 0, nextCursor: null });
      quotaReads += 1;
      return quotaReads === 1 ? new Promise<Response>(() => undefined) : quota(5);
    });
    renderPage();

    expect(await screen.findByText('Осталось 5 из 20 примерок в этом месяце')).toBeInTheDocument();
  });

  it('does not stop the page when the mark fails', async () => {
    fetchMock.mockImplementation((url: unknown) => {
      const { pathname } = new URL(String(url));
      if (pathname === '/api/fittings/seen') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'm', details: [] } }),
            { status: 500 },
          ),
        );
      }
      if (pathname === '/api/fittings') return json({ items: [], total: 0, nextCursor: null });
      return quota(5);
    });
    renderPage();

    expect(await screen.findByText('Здесь появятся ваши примерки')).toBeInTheDocument();
  });
});

describe('the try-on entry on the fittings page', () => {
  it('shows nothing extra without a fitting in the address', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: 'Примерить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('no longer opens a try-on from a product in the address: that starts on the product page', async () => {
    mocks.search.value = `product=${PRODUCT}`;
    renderPage();

    await screen.findByText('Здесь появятся ваши примерки');
    expect(screen.queryByRole('button', { name: 'Примерить' })).not.toBeInTheDocument();
    expect(screen.queryByText(/снова будут доступны/)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores a fitting that is not an id', async () => {
    mocks.search.value = 'fitting=not-an-id';
    renderPage();

    await screen.findByText('Здесь появятся ваши примерки');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the try-on window at once for a fitting in the address', async () => {
    mocks.search.value = `fitting=${FITTING_ID}`;
    renderPage();

    expect(await screen.findByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
  });

  it('on closing a fitting window replaces the address without `fitting`, keeping `from`', async () => {
    mocks.search.value = `fitting=${PRODUCT}&from=history`;
    renderPage();
    await screen.findByRole('dialog', { name: 'Онлайн-примерка' });

    await userEvent.setup().keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith(
      '/customer/fittings?from=history',
      { scroll: false },
    );
  });

  it('on closing a fitting window with no other parameter replaces the address with the bare path', async () => {
    mocks.search.value = `fitting=${PRODUCT}`;
    renderPage();
    await screen.findByRole('dialog', { name: 'Онлайн-примерка' });

    await userEvent.setup().keyboard('{Escape}');

    await vi.waitFor(() => expect(mocks.router.replace).toHaveBeenCalledTimes(1));
    expect(mocks.router.replace).toHaveBeenCalledWith('/customer/fittings', { scroll: false });
  });

  it('closes the window of a fitting in the address when another user signs in', async () => {
    mocks.search.value = `fitting=${PRODUCT}&from=history`;
    const page = renderPage();
    await screen.findByRole('dialog', { name: 'Онлайн-примерка' });

    mocks.session = { status: 'signed-in', user: { id: 'u2', email: 'b@example.com', name: null } };
    page.navigate();

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith(
      '/customer/fittings?from=history',
      { scroll: false },
    );
  });

  it('opens the window again when a link to the same fitting follows its close', async () => {
    mocks.search.value = `fitting=${PRODUCT}`;
    const page = renderPage();
    await screen.findByRole('dialog', { name: 'Онлайн-примерка' });
    await userEvent.setup().keyboard('{Escape}');
    await vi.waitFor(() => expect(mocks.router.replace).toHaveBeenCalledTimes(1));

    mocks.search.value = '';
    page.navigate();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    mocks.search.value = `fitting=${PRODUCT}`;
    page.navigate();

    expect(await screen.findByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
  });
});
