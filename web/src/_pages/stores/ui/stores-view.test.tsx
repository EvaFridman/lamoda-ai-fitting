import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Store, storeListOptions } from '@/entities/store';
import { ApiError } from '@/shared/api';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  clientFetch: vi.fn(),
  reportFailure: vi.fn(),
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  track: mocks.track,
  reset: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  clientFetch: mocks.clientFetch,
  reportFailure: mocks.reportFailure,
}));

import { SEARCH_PAUSE_MS, StoresView } from './stores-view';

function makeStore(n: number, over: Partial<Store>): Store {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name: `Магазин ${n}`,
    type: 'sport',
    city: 'Москва',
    street: 'ул. Тестовая',
    house: String(n),
    mall: '',
    latitude: 55,
    longitude: 37,
    metroStations: [],
    workTime: '10:00–22:00',
    description: '',
    phones: [],
    ...over,
  };
}

const OKHTA = makeStore(1, {
  name: 'ТЦ Охта Молл Sport',
  city: 'Санкт-Петербург',
  street: 'Брантовская дорога',
  house: '3',
  mall: 'Охта Молл',
  metroStations: ['Ладожская'],
  description: 'Большой магазин',
  phones: ['+7 (800) 100-00-01', '+7 (800) 100-00-02'],
});
const EKB_1 = makeStore(2, {
  name: 'ТЦ Гринвич Sport',
  city: 'Екатеринбург',
  street: 'ул. 8 Марта',
  house: '46',
  mall: 'Гринвич',
});
const EKB_2 = makeStore(3, {
  name: 'ТЦ Академический Outlet',
  type: 'outlet',
  city: 'Екатеринбург',
  street: 'ул. Вильгельма де Геннина',
  house: '34',
  mall: 'Академический',
});
const MOSCOW = makeStore(4, {
  name: 'ТЦ Авиапарк Sport',
  city: 'Москва',
  street: 'Ходынский бульвар',
  house: '4',
  mall: 'Авиапарк',
  metroStations: ['ЦСКА'],
});
const ALL = [OKHTA, EKB_1, EKB_2, MOSCOW];

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StoresView />
    </QueryClientProvider>,
  );
}

async function renderLoaded() {
  mocks.clientFetch.mockResolvedValue(ALL);
  const view = renderView();
  await screen.findByText(OKHTA.name);
  return view;
}

function field() {
  return screen.getByRole('searchbox', { name: 'Магазин, адрес или метро' });
}

function names() {
  return within(screen.getByRole('list', { name: 'Магазины' }))
    .getAllByRole('article')
    .map((card) => within(card).getAllByText(/^(ТЦ|Магазин)/)[0]?.textContent);
}

function openDetails(store: Store) {
  return screen.getByRole('button', { name: `Подробнее о магазине «${store.name}»` });
}

function searched() {
  return mocks.track.mock.calls.filter(([event]) => event === 'Stores Searched');
}

describe('StoresView', () => {
  beforeEach(() => {
    mocks.track.mockReset();
    mocks.clientFetch.mockReset();
    mocks.reportFailure.mockReset();
  });

  describe('list', () => {
    it('shows a busy placeholder while the stores load, with the search field', () => {
      mocks.clientFetch.mockReturnValue(new Promise(() => undefined));
      renderView();
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(field()).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Магазины' })).not.toBeInTheDocument();
    });

    it('lists every store with name, address, metro and hours (AC4)', async () => {
      await renderLoaded();
      expect(screen.getAllByRole('article')).toHaveLength(4);
      const card = screen.getByText(OKHTA.name).closest('article') as HTMLElement;
      expect(card).toHaveTextContent('Санкт-Петербург');
      expect(card).toHaveTextContent('Брантовская дорога');
      expect(card).toHaveTextContent('м. Ладожская');
      expect(card).toHaveTextContent('10:00–22:00');
    });

    it('shows the error text and reports the failure when the read fails', async () => {
      const failure = new ApiError('network', {
        kind: 'network',
        template: '/stores',
        method: 'GET',
      });
      mocks.clientFetch.mockRejectedValue(failure);
      renderView();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/\S/);
      expect(screen.queryByRole('list', { name: 'Магазины' })).not.toBeInTheDocument();
      await waitFor(() => expect(mocks.reportFailure).toHaveBeenCalledWith(failure));
    });
  });

  describe('search (AC7)', () => {
    it('leaves only the store near the metro station typed', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.type(field(), 'Ладожская');
      expect(names()).toEqual([OKHTA.name]);
    });

    it('leaves the stores of a city', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.type(field(), 'Екатеринбург');
      expect(names()).toEqual([EKB_1.name, EKB_2.name]);
    });

    it('says nothing was found when no store matches', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.type(field(), 'Нептун');
      expect(screen.getByRole('status')).toHaveTextContent('Ничего не нашлось');
      expect(screen.queryByRole('list', { name: 'Магазины' })).not.toBeInTheDocument();
    });

    it('brings every store back when the field is cleared', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.type(field(), 'Нептун');
      await user.click(screen.getByRole('button', { name: 'Очистить' }));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getAllByRole('article')).toHaveLength(4);
    });

    it.each(['ЛАДОЖСКАЯ', '  ладожская  ', 'охта   молл', '  ОХТА  '])(
      'ignores case and repeated or surrounding spaces in "%s"',
      async (text) => {
        const user = userEvent.setup();
        await renderLoaded();
        await user.type(field(), text);
        expect(names()).toEqual([OKHTA.name]);
      },
    );

    it('finds a store by a hyphenated mall name, typed with a hyphen or a space', async () => {
      const mall = makeStore(9, { name: 'Магазин 9', mall: 'Рио-Молл', city: 'Тверь' });
      mocks.clientFetch.mockResolvedValue([...ALL, mall]);
      const user = userEvent.setup();
      renderView();
      await screen.findByText(OKHTA.name);
      await user.type(field(), 'рио-молл');
      expect(names()).toEqual([mall.name]);
      await user.clear(field());
      await user.type(field(), 'рио молл');
      expect(names()).toEqual([mall.name]);
    });

    it('treats ё and е as one letter in both the data and the text', async () => {
      const metro = makeStore(9, {
        name: 'Магазин 9',
        city: 'Тверь',
        metroStations: ['Тёплый Стан'],
      });
      mocks.clientFetch.mockResolvedValue([...ALL, metro]);
      const user = userEvent.setup();
      renderView();
      await screen.findByText(OKHTA.name);
      await user.type(field(), 'теплый');
      expect(names()).toEqual([metro.name]);
      await user.clear(field());
      await user.type(field(), 'ТЁПЛЫЙ');
      expect(names()).toEqual([metro.name]);
    });

    it('turns the browser autofill off, so Back does not restore text from another field', async () => {
      await renderLoaded();
      expect(field()).toHaveAttribute('autocomplete', 'off');
    });

    it('keeps the typed text out of every attribute', async () => {
      const user = userEvent.setup();
      const { baseElement } = await renderLoaded();
      await user.type(field(), 'Ладожская');
      const values = Array.from(baseElement.querySelectorAll('*')).flatMap((element) =>
        Array.from(element.attributes, (attribute) => attribute.value),
      );
      expect(values.some((value) => value.toLowerCase().includes('ладожская'))).toBe(false);
    });
  });

  describe('cards', () => {
    it('selects the clicked store only', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      const [first, second] = screen.getAllByRole('button', { pressed: false });
      await user.click(first as HTMLElement);
      expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
      await user.click(second as HTMLElement);
      const pressed = screen.getAllByRole('button', { pressed: true });
      expect(pressed).toHaveLength(1);
      expect(pressed[0]).toBe(second);
    });

    it('selects a card with Enter', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      const [first] = screen.getAllByRole('button', { pressed: false });
      (first as HTMLElement).focus();
      await user.keyboard('{Enter}');
      expect(screen.getAllByRole('button', { pressed: true })).toEqual([first]);
    });

    it('leaves the selection alone when a details button is pressed', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      const [first] = screen.getAllByRole('button', { pressed: false });
      await user.click(first as HTMLElement);
      await user.click(openDetails(EKB_1));
      await user.click(openDetails(MOSCOW));
      expect(screen.getAllByRole('button', { pressed: true })).toEqual([first]);
    });

    it('opens the details with tel links and a route in a new tab, and closes them again (AC4)', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      expect(screen.queryByText(OKHTA.description)).not.toBeInTheDocument();
      await user.click(openDetails(OKHTA));
      expect(openDetails(OKHTA)).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(OKHTA.description)).toBeInTheDocument();
      const phone = screen.getByRole('link', { name: '+7 (800) 100-00-01' });
      expect(phone.getAttribute('href')).toMatch(/^tel:/);
      const route = screen.getByRole('link', { name: 'Проложить маршрут' });
      expect(route).toHaveAttribute('target', '_blank');
      await user.click(openDetails(OKHTA));
      expect(screen.queryByText(OKHTA.description)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Проложить маршрут' })).not.toBeInTheDocument();
    });

    it('keeps several cards open at once', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(openDetails(OKHTA));
      await user.click(openDetails(EKB_1));
      expect(openDetails(OKHTA)).toHaveAttribute('aria-expanded', 'true');
      expect(openDetails(EKB_1)).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getAllByRole('link', { name: 'Проложить маршрут' })).toHaveLength(2);
    });
  });

  describe('tracked elements', () => {
    // The links would navigate; jsdom only reports that it cannot.
    const cancel = (event: Event) => event.preventDefault();
    beforeEach(() => document.addEventListener('click', cancel));
    afterEach(() => document.removeEventListener('click', cancel));

    function clicks() {
      return mocks.track.mock.calls
        .filter(([event]) => event === 'Element Clicked')
        .map(([, props]) => props as Record<string, unknown>);
    }

    it('sends stores.card for a click on the main area', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(screen.getAllByRole('button', { pressed: false })[0] as HTMLElement);
      expect(clicks()).toEqual([expect.objectContaining({ element: 'stores.card' })]);
    });

    it('sends stores.details with the state the click moves to', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(openDetails(OKHTA));
      await user.click(openDetails(OKHTA));
      expect(clicks()).toEqual([
        expect.objectContaining({ element: 'stores.details', expanded: true }),
        expect.objectContaining({ element: 'stores.details', expanded: false }),
      ]);
    });

    it('sends stores.phone and stores.route from the details', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(openDetails(OKHTA));
      mocks.track.mockClear();
      await user.click(screen.getByRole('link', { name: '+7 (800) 100-00-01' }));
      await user.click(screen.getByRole('link', { name: 'Проложить маршрут' }));
      expect(clicks()).toEqual([
        expect.objectContaining({ element: 'stores.phone' }),
        expect.objectContaining({ element: 'stores.route' }),
      ]);
    });

    it('names no store in any send', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(openDetails(OKHTA));
      await user.click(screen.getByRole('link', { name: 'Проложить маршрут' }));
      expect(JSON.stringify(mocks.track.mock.calls)).not.toContain('Охта');
    });
  });

  describe('text already in the field when React takes over', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    const mounted: { root: Root; container: HTMLElement }[] = [];
    afterEach(async () => {
      vi.useRealTimers();
      for (const { root, container } of mounted.splice(0)) {
        await act(async () => root.unmount());
        container.remove();
      }
    });

    // Typed before hydration or restored by the browser: the input holds the text, but no
    // `onValueChange` ever fires for it.
    async function hydrateWithText(text: string) {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      client.setQueryData(storeListOptions().queryKey, ALL);
      const tree = (
        <QueryClientProvider client={client}>
          <StoresView />
        </QueryClientProvider>
      );
      const container = document.createElement('div');
      document.body.append(container);
      container.innerHTML = renderToString(tree);
      (container.querySelector('input') as HTMLInputElement).value = text;
      let root!: Root;
      await act(async () => {
        root = hydrateRoot(container, tree);
      });
      mounted.push({ root, container });
    }

    it('filters the list by it', async () => {
      await hydrateWithText('Ладожская');
      expect(field()).toHaveValue('Ладожская');
      expect(names()).toEqual([OKHTA.name]);
    });

    it('sends Stores Searched for it after the pause', async () => {
      await hydrateWithText('Ладожская');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS + 10);
      });
      expect(searched()).toEqual([
        ['Stores Searched', { query_length: 'Ладожская'.length, results: 1 }],
      ]);
    });
  });

  describe('Stores Searched', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    function type(text: string) {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      return user.type(field(), text);
    }

    async function pass(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    it('is sent once, after the pause, with the trimmed length and the match count', async () => {
      await renderLoaded();
      await type('  Екатеринбург ');
      await pass(SEARCH_PAUSE_MS - 100);
      expect(searched()).toHaveLength(0);
      await pass(200);
      expect(mocks.track).toHaveBeenCalledWith('Stores Searched', {
        query_length: 'Екатеринбург'.length,
        results: 2,
      });
      expect(searched()).toHaveLength(1);
    });

    it('counts zero results', async () => {
      await renderLoaded();
      await type('Нептун');
      await pass(SEARCH_PAUSE_MS + 10);
      expect(mocks.track).toHaveBeenCalledWith('Stores Searched', {
        query_length: 6,
        results: 0,
      });
    });

    it('restarts the pause when typing goes on', async () => {
      await renderLoaded();
      await type('Лад');
      await pass(SEARCH_PAUSE_MS - 200);
      await type('ожская');
      await pass(SEARCH_PAUSE_MS - 200);
      expect(searched()).toHaveLength(0);
      await pass(300);
      expect(searched()).toEqual([
        ['Stores Searched', { query_length: 'Ладожская'.length, results: 1 }],
      ]);
    });

    it.each(['', '   '])('is not sent for the text "%s"', async (text) => {
      await renderLoaded();
      if (text) await type(text);
      await pass(SEARCH_PAUSE_MS * 2);
      expect(searched()).toHaveLength(0);
    });

    it('is not sent when clearing the field', async () => {
      await renderLoaded();
      await type('Ладожская');
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole('button', { name: 'Очистить' }));
      await pass(SEARCH_PAUSE_MS * 2);
      expect(searched()).toHaveLength(0);
    });

    it('is not sent again for the same trimmed text as the last one sent', async () => {
      await renderLoaded();
      await type('Ладожская');
      await pass(SEARCH_PAUSE_MS + 10);
      expect(searched()).toHaveLength(1);
      await type(' ');
      await pass(SEARCH_PAUSE_MS + 10);
      expect(searched()).toHaveLength(1);
    });

    it('is sent again for a different text', async () => {
      await renderLoaded();
      await type('Ладожская');
      await pass(SEARCH_PAUSE_MS + 10);
      await type('{Backspace}');
      await pass(SEARCH_PAUSE_MS + 10);
      expect(searched()).toHaveLength(2);
      expect(searched()[1]?.[1]).toEqual({ query_length: 8, results: 1 });
    });
  });
});
