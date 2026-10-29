import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  fits: [] as unknown[],
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

// The map is Yandex's script: a stub that shows the fit's kind and the number of stores it was
// given, with a button per store that is a pin's click.
vi.mock('@/widgets/stores-map', () => ({
  CITY_ZOOM: 12,
  StoresMap: ({
    stores,
    fit,
    selectedId,
    onSelect,
    pinEvents,
  }: {
    stores: readonly { id: string; name: string }[];
    fit: {
      kind: string;
      store?: { id: string };
      stores?: readonly unknown[];
      singleZoom?: number;
    };
    selectedId: string | null;
    onSelect: (id: string) => void;
    pinEvents?: { onClick?: () => void };
  }) => {
    mocks.fits.push(fit);
    return (
      <div data-testid="map">
        <span data-testid="fit">{fit.kind}</span>
        <span data-testid="fit store">{fit.store?.id ?? ''}</span>
        <span data-testid="fit stores">{fit.stores?.length ?? ''}</span>
        <span data-testid="fit zoom">{fit.singleZoom ?? ''}</span>
        <span data-testid="selected">{selectedId ?? ''}</span>
        {stores.map((store) => (
          <button
            key={store.id}
            type="button"
            onClick={() => {
              onSelect(store.id);
              pinEvents?.onClick?.();
            }}
          >
            Пин {store.name}
          </button>
        ))}
      </div>
    );
  },
}));

import { SEARCH_APPLY_MS, SEARCH_PAUSE_MS, StoresView } from './stores-view';

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
  latitude: 59.9,
  longitude: 30.4,
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
  latitude: 56.84,
  longitude: 60.6,
  street: 'ул. 8 Марта',
  house: '46',
  mall: 'Гринвич',
});
const EKB_2 = makeStore(3, {
  name: 'ТЦ Академический Outlet',
  type: 'outlet',
  city: 'Екатеринбург',
  latitude: 56.78,
  longitude: 60.55,
  street: 'ул. Вильгельма де Геннина',
  house: '34',
  mall: 'Академический',
});
const MOSCOW = makeStore(4, {
  name: 'ТЦ Авиапарк Sport',
  city: 'Москва',
  latitude: 55.79,
  longitude: 37.53,
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
    mocks.fits.length = 0;
    // The page's own ask for the position is off unless a test turns it on.
    window.localStorage.clear();
    window.localStorage.setItem('city-asked', '1');
    // jsdom has no scrolling; a pin's click scrolls the list to its card.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    window.localStorage.clear();
    Reflect.deleteProperty(navigator, 'geolocation');
    Reflect.deleteProperty(window, 'isSecureContext');
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
      await waitFor(() => expect(names()).toEqual([OKHTA.name]));
    });

    it('leaves the stores of a city', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.type(field(), 'Екатеринбург');
      await waitFor(() => expect(names()).toEqual([EKB_1.name, EKB_2.name]));
    });

    it('says nothing was found when no store matches', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.type(field(), 'Нептун');
      expect(await screen.findByRole('status')).toHaveTextContent('Ничего не нашлось');
      expect(screen.queryByRole('list', { name: 'Магазины' })).not.toBeInTheDocument();
    });

    it('brings every store back when the field is cleared', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.type(field(), 'Нептун');
      await screen.findByRole('status');
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
        await waitFor(() => expect(names()).toEqual([OKHTA.name]));
      },
    );

    it('finds a store by a hyphenated mall name, typed with a hyphen or a space', async () => {
      const mall = makeStore(9, { name: 'Магазин 9', mall: 'Рио-Молл', city: 'Тверь' });
      mocks.clientFetch.mockResolvedValue([...ALL, mall]);
      const user = userEvent.setup();
      renderView();
      await screen.findByText(OKHTA.name);
      await user.type(field(), 'рио-молл');
      await waitFor(() => expect(names()).toEqual([mall.name]));
      await user.clear(field());
      await waitFor(() => expect(names()).toHaveLength(5));
      await user.type(field(), 'рио молл');
      await waitFor(() => expect(names()).toEqual([mall.name]));
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
      await waitFor(() => expect(names()).toEqual([metro.name]));
      await user.clear(field());
      await waitFor(() => expect(names()).toHaveLength(5));
      await user.type(field(), 'ТЁПЛЫЙ');
      await waitFor(() => expect(names()).toEqual([metro.name]));
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
      expect(screen.getAllByRole('button', { pressed: true })).toEqual([first]);
      await user.click(second as HTMLElement);
      expect(screen.getAllByRole('button', { pressed: true })).toEqual([second]);
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

  describe('tabs and the map', () => {
    const cancel = (event: Event) => event.preventDefault();
    beforeEach(() => document.addEventListener('click', cancel));
    afterEach(() => {
      document.removeEventListener('click', cancel);
      vi.useRealTimers();
    });

    function out(name: string) {
      return screen.getByTestId(name);
    }

    // The tab list is `display: none` from the base rule, so its tabs are found by `hidden`.
    function tab(name: string) {
      return screen.getByRole('tab', { name, hidden: true });
    }

    function view() {
      return field().closest('[data-tab]');
    }

    function overCard() {
      return screen.queryByRole('button', { name: 'Закрыть карточку магазина' })?.parentElement;
    }

    function tabClicks() {
      return mocks.track.mock.calls
        .filter(([event, props]) => event === 'Element Clicked' && props.element === 'stores.tab')
        .map(([, props]) => props as Record<string, unknown>);
    }

    function pin(store: Store) {
      return screen.getByRole('button', { name: `Пин ${store.name}`, hidden: true });
    }

    it('opens on «Список» with the list and the map both in the DOM', async () => {
      await renderLoaded();
      expect(tab('Список')).toHaveAttribute('aria-selected', 'true');
      expect(tab('Карта')).toHaveAttribute('aria-selected', 'false');
      expect(view()).toHaveAttribute('data-tab', 'list');
      expect(screen.queryByRole('tabpanel', { hidden: true })).not.toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Магазины' })).toBeInTheDocument();
      expect(screen.getByTestId('map')).toBeInTheDocument();
      expect(out('fit')).toHaveTextContent('start');
    });

    it('shows the map when a card is clicked, centred on its store', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(screen.getAllByRole('button', { pressed: false })[1] as HTMLElement);
      expect(tab('Карта')).toHaveAttribute('aria-selected', 'true');
      expect(view()).toHaveAttribute('data-tab', 'map');
      expect(out('fit')).toHaveTextContent('store');
      expect(out('fit store')).toHaveTextContent(EKB_1.id);
      expect(out('selected')).toHaveTextContent(EKB_1.id);
    });

    it('sends stores.tab with the tab picked, and none for a card switching to the map', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(tab('Карта'));
      await user.click(tab('Список'));
      expect(view()).toHaveAttribute('data-tab', 'list');
      expect(tabClicks()).toEqual([
        expect.objectContaining({ element: 'stores.tab', tab: 'map' }),
        expect.objectContaining({ element: 'stores.tab', tab: 'list' }),
      ]);
      mocks.track.mockClear();
      await user.click(screen.getAllByRole('button', { pressed: false })[0] as HTMLElement);
      expect(tabClicks()).toEqual([]);
    });

    it('fits the map again, to the same place, when «Карта» is picked', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      const before = new Set(mocks.fits).size;
      await user.click(tab('Карта'));
      expect(new Set(mocks.fits).size).toBe(before + 1);
      expect(out('fit')).toHaveTextContent('start');
      expect(mocks.fits.at(-1)).toEqual(mocks.fits.at(-2));
    });

    it('selects a store on a pin click and shows its card over the map', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      expect(overCard()).toBeUndefined();
      await user.click(pin(MOSCOW));
      expect(out('selected')).toHaveTextContent(MOSCOW.id);
      expect(out('fit')).toHaveTextContent('start');
      expect(view()).toHaveAttribute('data-tab', 'list');
      const card = within(overCard() as HTMLElement).getByRole('article');
      expect(card).toHaveTextContent(MOSCOW.name);
    });

    it('closes the card over the map with its button, keeping the selection', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(pin(MOSCOW));
      await user.click(screen.getByRole('button', { name: 'Закрыть карточку магазина' }));
      expect(overCard()).toBeUndefined();
      expect(out('selected')).toHaveTextContent(MOSCOW.id);
    });

    it('only centres the map on the store when the card over it is clicked, and keeps it open', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(pin(MOSCOW));
      await user.click(within(overCard() as HTMLElement).getByRole('button', { pressed: true }));
      expect(out('fit')).toHaveTextContent('store');
      expect(out('fit store')).toHaveTextContent(MOSCOW.id);
      expect(view()).toHaveAttribute('data-tab', 'list');
      expect(overCard()).toBeDefined();
    });

    it('drops the card over the map when the search leaves its store out, for good', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(pin(MOSCOW));
      await user.type(field(), 'Ладожская');
      await waitFor(() => expect(overCard()).toBeUndefined());
      await user.click(screen.getByRole('button', { name: 'Очистить' }));
      expect(overCard()).toBeUndefined();
      expect(screen.getAllByRole('article')).toHaveLength(4);
    });

    it('sends stores.pin for a pin click, naming no store', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      mocks.track.mockClear();
      await user.click(pin(OKHTA));
      expect(mocks.track.mock.calls.map(([event, props]) => [event, props.element])).toEqual([
        ['Element Clicked', 'stores.pin'],
      ]);
      expect(JSON.stringify(mocks.track.mock.calls)).not.toContain('Охта');
    });

    it('gives the map the stores the search left and fits them once per set', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await renderLoaded();
      await user.type(field(), 'Екат');
      await waitFor(() => expect(out('fit')).toHaveTextContent('stores'));
      expect(out('fit stores')).toHaveTextContent('2');
      expect(
        screen.queryByRole('button', { name: `Пин ${OKHTA.name}`, hidden: true }),
      ).not.toBeInTheDocument();
      const afterFirst = new Set(mocks.fits).size;
      await user.type(field(), 'е');
      await waitFor(() => expect(field()).toHaveValue('Екате'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_APPLY_MS + 10);
      });
      expect(new Set(mocks.fits).size).toBe(afterFirst);
    });

    it('goes back to the start when the text is cleared', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.type(field(), 'Ладожская');
      await waitFor(() => expect(out('fit stores')).toHaveTextContent('1'));
      await user.click(screen.getByRole('button', { name: 'Очистить' }));
      expect(out('fit')).toHaveTextContent('start');
    });
  });

  describe('text already in the field when React takes over', () => {
    // No `shouldAdvanceTime`: no timer elapses unless a test advances it.
    beforeEach(() => vi.useFakeTimers());
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

    async function pass(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    // The list is gone when nothing matches, so `names()` cannot read an empty result.
    function cards() {
      return screen.queryAllByRole('article').length;
    }

    it('waits the normal pause for an edit of it', async () => {
      await hydrateWithText('Ладожская');
      // userEvent's own delays need the clock to run; the hydrated text is already applied.
      vi.useRealTimers();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.type(field(), 'я');
      expect(field()).toHaveValue('Ладожскаяя');
      await pass(SEARCH_APPLY_MS - 50);
      expect(names()).toEqual([OKHTA.name]);
      await pass(100);
      expect(cards()).toBe(0);
    });

    it('waits the pause again when the restored text is typed back after an edit', async () => {
      await hydrateWithText('Ладожская');
      // userEvent's own delays need the clock to run; the hydrated text is already applied.
      vi.useRealTimers();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.type(field(), 'я');
      await pass(SEARCH_APPLY_MS + 50);
      expect(cards()).toBe(0);
      await user.type(field(), '{Backspace}');
      expect(field()).toHaveValue('Ладожская');
      await pass(SEARCH_APPLY_MS - 50);
      expect(cards()).toBe(0);
      await pass(100);
      expect(names()).toEqual([OKHTA.name]);
    });

    it('sends Stores Searched for it after the pause', async () => {
      await hydrateWithText('Ладожская');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS + 10);
      });
      expect(searched()).toEqual([
        ['Stores Searched', { query_length: 'Ладожская'.length, results: 1, scope: 'all' }],
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
        scope: 'all',
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
        scope: 'all',
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
        ['Stores Searched', { query_length: 'Ладожская'.length, results: 1, scope: 'all' }],
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
      expect(searched()[1]?.[1]).toEqual({ query_length: 8, results: 1, scope: 'all' });
    });
  });

  describe('city (spec 0026)', () => {
    const cancel = (event: Event) => event.preventDefault();
    beforeEach(() => document.addEventListener('click', cancel));
    afterEach(() => {
      document.removeEventListener('click', cancel);
      vi.useRealTimers();
    });

    async function renderCity(city: string | null = null) {
      if (city !== null) window.localStorage.setItem('city', city);
      mocks.clientFetch.mockResolvedValue(ALL);
      const view = renderView();
      await screen.findByText(city === null ? OKHTA.name : EKB_1.name);
      return view;
    }

    function fakeUser() {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    }

    async function pass(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    function out(name: string) {
      return screen.getByTestId(name);
    }

    function clicks() {
      return mocks.track.mock.calls
        .filter(([event]) => event === 'Element Clicked')
        .map(([, props]) => props as Record<string, unknown>);
    }

    function stubGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']) {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition },
      });
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    }

    function positionAt(latitude: number, longitude: number) {
      return vi.fn((success: PositionCallback) =>
        success({ coords: { latitude, longitude } } as GeolocationPosition),
      );
    }

    it('shows every store, «Выбрать город» and no switch while no city is chosen', async () => {
      await renderCity();
      expect(screen.getByRole('button', { name: 'Выбрать город' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Все города' })).not.toBeInTheDocument();
      expect(names()).toHaveLength(4);
      expect(out('fit')).toHaveTextContent('start');
    });

    it('shows only the stored city’s stores, fitted at the city zoom (AC9)', async () => {
      await renderCity('Екатеринбург');
      expect(screen.getByRole('button', { name: 'Екатеринбург', pressed: true })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Все города', pressed: false })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Изменить город' })).toBeInTheDocument();
      expect(names()).toEqual([EKB_1.name, EKB_2.name]);
      expect(out('fit')).toHaveTextContent('stores');
      expect(out('fit stores')).toHaveTextContent('2');
      expect(out('fit zoom')).toHaveTextContent('12');
    });

    it('ignores a stored city the stores do not have', async () => {
      window.localStorage.setItem('city', 'Нептун');
      await renderCity();
      expect(screen.queryByRole('button', { name: 'Все города' })).not.toBeInTheDocument();
      expect(names()).toHaveLength(4);
    });

    it('«Все города» shows every store on the start fit and sends stores.scope', async () => {
      const user = userEvent.setup();
      await renderCity('Екатеринбург');
      await user.click(screen.getByRole('button', { name: 'Все города' }));
      expect(screen.getByRole('button', { name: 'Все города', pressed: true })).toBeVisible();
      expect(names()).toHaveLength(4);
      expect(out('fit')).toHaveTextContent('start');
      expect(clicks()).toEqual([
        expect.objectContaining({ element: 'stores.scope', scope: 'all' }),
      ]);
    });

    it('goes back to the city when one is chosen in another tab', async () => {
      const user = userEvent.setup();
      await renderCity('Екатеринбург');
      await user.click(screen.getByRole('button', { name: 'Все города' }));
      expect(names()).toHaveLength(4);
      act(() => {
        window.localStorage.setItem('city', 'Москва');
        window.dispatchEvent(new StorageEvent('storage', { key: 'city' }));
      });
      expect(names()).toEqual([MOSCOW.name]);
      expect(screen.getByRole('button', { name: 'Москва', pressed: true })).toBeVisible();
    });

    it('searches within the city', async () => {
      const user = userEvent.setup();
      await renderCity('Екатеринбург');
      await user.type(field(), 'Гринвич');
      await waitFor(() => expect(names()).toEqual([EKB_1.name]));
      expect(out('fit stores')).toHaveTextContent('1');
    });

    it('offers to search every city when the city has no match, keeping the text', async () => {
      const user = userEvent.setup();
      await renderCity('Екатеринбург');
      await user.type(field(), 'Ладожская');
      expect(await screen.findByRole('status')).toHaveTextContent('Ничего не нашлось');
      await user.click(screen.getByRole('button', { name: 'Искать во всех городах' }));
      expect(names()).toEqual([OKHTA.name]);
      expect(field()).toHaveValue('Ладожская');
      expect(screen.getByRole('button', { name: 'Все города', pressed: true })).toBeVisible();
      expect(clicks()).toEqual([expect.objectContaining({ element: 'stores.search-all' })]);
    });

    it('has no such button in «Все города» or without a city', async () => {
      const user = userEvent.setup();
      await renderCity('Екатеринбург');
      await user.click(screen.getByRole('button', { name: 'Все города' }));
      await user.type(field(), 'Нептун');
      expect(await screen.findByRole('status')).toHaveTextContent('Ничего не нашлось');
      expect(
        screen.queryByRole('button', { name: 'Искать во всех городах' }),
      ).not.toBeInTheDocument();
    });

    it('moves the list and the map once, 500 ms after the last key, and at once on clearing (0024 AC18)', async () => {
      const user = fakeUser();
      await renderCity();
      const before = new Set(mocks.fits).size;
      await user.type(field(), 'Екат');
      expect(names()).toHaveLength(4);
      expect(out('fit')).toHaveTextContent('start');
      expect(new Set(mocks.fits).size).toBe(before);
      await pass(SEARCH_APPLY_MS - 50);
      expect(names()).toHaveLength(4);
      await pass(100);
      expect(names()).toEqual([EKB_1.name, EKB_2.name]);
      expect(out('fit stores')).toHaveTextContent('2');
      expect(new Set(mocks.fits).size).toBe(before + 1);
      await user.click(screen.getByRole('button', { name: 'Очистить' }));
      expect(names()).toHaveLength(4);
      expect(out('fit')).toHaveTextContent('start');
    });

    it('applies a whitespace-only text at once', async () => {
      const user = fakeUser();
      await renderCity();
      await user.type(field(), 'Екат');
      await pass(SEARCH_APPLY_MS + 10);
      expect(names()).toHaveLength(2);
      fireEvent.change(field(), { target: { value: '   ' } });
      expect(names()).toHaveLength(4);
      expect(out('fit')).toHaveTextContent('start');
    });

    it('never shows the old text’s matches when a new text is typed right after clearing', async () => {
      const user = fakeUser();
      await renderCity();
      await user.type(field(), 'Екат');
      await pass(SEARCH_APPLY_MS + 10);
      expect(names()).toHaveLength(2);
      await user.click(screen.getByRole('button', { name: 'Очистить' }));
      await user.type(field(), 'Н');
      expect(names()).toHaveLength(4);
      expect(out('fit')).toHaveTextContent('start');
    });

    it('sends Stores Searched with scope city and the city’s match count', async () => {
      const user = fakeUser();
      await renderCity('Екатеринбург');
      await user.type(field(), 'ул');
      await pass(SEARCH_PAUSE_MS + 10);
      expect(searched()).toEqual([
        ['Stores Searched', { query_length: 2, results: 2, scope: 'city' }],
      ]);
    });

    it('sends Stores Searched with scope all after «Все города»', async () => {
      const user = fakeUser();
      await renderCity('Екатеринбург');
      await user.click(screen.getByRole('button', { name: 'Все города' }));
      await user.type(field(), 'Гринвич');
      await pass(SEARCH_PAUSE_MS + 10);
      expect(searched()).toEqual([
        ['Stores Searched', { query_length: 7, results: 1, scope: 'all' }],
      ]);
    });

    describe('the page’s own ask', () => {
      beforeEach(() => window.localStorage.removeItem('city-asked'));

      it('chooses the found city once and shows its stores (AC10)', async () => {
        const getCurrentPosition = positionAt(56.83, 60.6);
        stubGeolocation(getCurrentPosition);
        mocks.clientFetch.mockResolvedValue(ALL);
        renderView();
        await waitFor(() => expect(names()).toEqual([EKB_1.name, EKB_2.name]));
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem('city')).toBe('Екатеринбург');
        expect(screen.getByRole('button', { name: 'Екатеринбург', pressed: true })).toBeVisible();
      });

      it('says no store is near and keeps every store when the position is far', async () => {
        stubGeolocation(positionAt(-10, 100));
        mocks.clientFetch.mockResolvedValue(ALL);
        renderView();
        expect(await screen.findByText('Рядом с вами пока нет магазинов')).toBeVisible();
        expect(names()).toHaveLength(4);
        expect(screen.getByRole('button', { name: 'Выбрать город' })).toBeInTheDocument();
      });

      it('shows today’s view without a line when the position is refused', async () => {
        const getCurrentPosition = vi.fn(
          (_success: PositionCallback, error?: PositionErrorCallback | null) =>
            error?.({ code: 1 } as GeolocationPositionError),
        );
        stubGeolocation(getCurrentPosition);
        mocks.clientFetch.mockResolvedValue(ALL);
        renderView();
        await screen.findByText(OKHTA.name);
        await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1));
        await act(async () => undefined);
        expect(names()).toHaveLength(4);
        expect(screen.queryByText('Рядом с вами пока нет магазинов')).not.toBeInTheDocument();
        expect(window.localStorage.getItem('city')).toBeNull();
      });

      it('does not ask again once asked', async () => {
        const getCurrentPosition = vi.fn();
        stubGeolocation(getCurrentPosition);
        window.localStorage.setItem('city-asked', '1');
        await renderCity();
        expect(getCurrentPosition).not.toHaveBeenCalled();
      });
    });

    describe('the window «Ваш город»', () => {
      it('shows the city’s stores again when the chosen city is picked from «Все города»', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        await renderCity('Екатеринбург');
        await user.click(screen.getByRole('button', { name: 'Все города' }));
        expect(names()).toHaveLength(4);
        await user.click(screen.getByRole('button', { name: 'Изменить город' }));
        const dialog = await screen.findByRole('dialog', { name: 'Ваш город' });
        await user.click(within(dialog).getByRole('button', { name: 'Екатеринбург' }));
        await waitFor(() => expect(names()).toEqual([EKB_1.name, EKB_2.name]));
        expect(screen.getByRole('button', { name: 'Екатеринбург', pressed: true })).toBeVisible();
      });

      it('opens from «Выбрать город», sends city.open and moves the page to a pick (AC11)', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        await renderCity();
        await user.click(screen.getByRole('button', { name: 'Выбрать город' }));
        const dialog = await screen.findByRole('dialog', { name: 'Ваш город' });
        expect(clicks()).toEqual([
          expect.objectContaining({ element: 'city.open', source: 'stores', had_city: false }),
        ]);
        await user.click(within(dialog).getByRole('button', { name: 'Москва' }));
        await waitFor(() => expect(names()).toEqual([MOSCOW.name]));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Изменить город' })).toHaveFocus(),
        );
      });

      it('opens from «Изменить город» with had_city and returns the focus when closed', async () => {
        const user = userEvent.setup();
        await renderCity('Екатеринбург');
        const button = screen.getByRole('button', { name: 'Изменить город' });
        await user.click(button);
        await screen.findByRole('dialog', { name: 'Ваш город' });
        expect(clicks()).toEqual([
          expect.objectContaining({ element: 'city.open', source: 'stores', had_city: true }),
        ]);
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(button).toHaveFocus());
        expect(names()).toEqual([EKB_1.name, EKB_2.name]);
      });
    });
  });
});
