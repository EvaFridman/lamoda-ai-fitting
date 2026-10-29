import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { City } from '@/entities/store';
import { errorText } from '@/shared/api';
import { track } from '@/shared/analytics/client';

import { chooseCity } from '../model/city-store';
import { CityModal } from './city-modal';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/shared/analytics/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/analytics/client')>()),
  track: vi.fn(),
}));

const CITIES: City[] = [
  { name: 'Москва', points: [[37.62, 55.75]] },
  { name: 'Санкт-Петербург', points: [[30.31, 59.94]] },
  { name: 'Казань', points: [[49.1, 55.79]] },
];

// Base UI turns pointer events off on the page while a modal is open (see the kit's modal test).
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

function renderModal(
  props: { cities?: City[] | null; failure?: unknown; onChosen?: () => void } = {},
) {
  const onOpenChange = vi.fn();
  render(
    <CityModal
      cities={props.cities === undefined ? CITIES : props.cities}
      failure={props.failure}
      open
      onOpenChange={onOpenChange}
      onChosen={props.onChosen}
    />,
  );
  return onOpenChange;
}

function setGeolocation(
  getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) => void,
) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: vi.fn(getCurrentPosition) },
  });
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
}

const at = (latitude: number, longitude: number) => (ok: PositionCallback) =>
  ok({ coords: { latitude, longitude } } as GeolocationPosition);

const sent = () => JSON.stringify(vi.mocked(track).mock.calls);

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(track).mockClear();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
  Reflect.deleteProperty(window, 'isSecureContext');
});

describe('CityModal', () => {
  it('shows the title, the automatic button, the search and the cities in order', async () => {
    renderModal();
    expect(await screen.findByRole('dialog', { name: 'Ваш город' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Определить автоматически' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Найти город' })).toBeInTheDocument();
    const names = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(names).toEqual(['Москва', 'Санкт-Петербург', 'Казань']);
  });

  it('marks the chosen city as current', async () => {
    window.localStorage.setItem('city', 'Санкт-Петербург');
    renderModal();
    expect(await screen.findByRole('button', { name: 'Санкт-Петербург' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Москва' })).not.toHaveAttribute('aria-current');
  });

  it('stores a clicked city and closes', async () => {
    const onOpenChange = renderModal();
    await setup().click(await screen.findByRole('button', { name: 'Казань' }));
    expect(window.localStorage.getItem('city')).toBe('Казань');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onChosen on a pick, also of the city already chosen', async () => {
    window.localStorage.setItem('city', 'Казань');
    const onChosen = vi.fn();
    renderModal({ onChosen });
    await setup().click(await screen.findByRole('button', { name: 'Казань' }));
    expect(onChosen).toHaveBeenCalledTimes(1);
  });

  it('does not call onChosen when closed without choosing', async () => {
    const onChosen = vi.fn();
    const onOpenChange = renderModal({ onChosen });
    await screen.findByRole('dialog');
    await setup().keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChosen).not.toHaveBeenCalled();
  });

  it('filters the list by the search and tells when nothing matches', async () => {
    renderModal();
    const user = setup();
    const search = await screen.findByRole('searchbox', { name: 'Найти город' });
    await user.type(search, 'каз');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Казань']);
    await user.clear(search);
    await user.type(search, 'ъъъ');
    expect(screen.getByText('Ничего не нашлось')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the general error text and no list or automatic button without cities', async () => {
    renderModal({ cities: null });
    expect(await screen.findByText(errorText(undefined))).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Определить автоматически' }),
    ).not.toBeInTheDocument();
  });
});

describe('CityModal automatic search', () => {
  it('chooses the found city and closes', async () => {
    setGeolocation(at(55.7512, 37.6184));
    const onOpenChange = renderModal();
    await setup().click(await screen.findByRole('button', { name: 'Определить автоматически' }));
    await vi.waitFor(() => expect(window.localStorage.getItem('city')).toBe('Москва'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onChosen for a found city but not for a failed search', async () => {
    const onChosen = vi.fn();
    setGeolocation(at(55.7512, 37.6184));
    renderModal({ onChosen });
    await setup().click(await screen.findByRole('button', { name: 'Определить автоматически' }));
    await vi.waitFor(() => expect(onChosen).toHaveBeenCalledTimes(1));
  });

  it('does not call onChosen when the position is refused', async () => {
    const onChosen = vi.fn();
    setGeolocation((_ok, fail) => fail({ code: 1 } as GeolocationPositionError));
    renderModal({ onChosen });
    await setup().click(await screen.findByRole('button', { name: 'Определить автоматически' }));
    await screen.findByText('Доступ к геопозиции запрещён');
    expect(onChosen).not.toHaveBeenCalled();
  });

  it.each([
    ['far from every store', at(48.7, 44.5), 'Рядом с вами пока нет магазинов'],
    [
      'refused',
      (_ok: PositionCallback, fail: PositionErrorCallback) =>
        fail({ code: 1 } as GeolocationPositionError),
      'Доступ к геопозиции запрещён',
    ],
    [
      'failed',
      (_ok: PositionCallback, fail: PositionErrorCallback) =>
        fail({ code: 3 } as GeolocationPositionError),
      'Не удалось определить местоположение',
    ],
  ])('says so when the position is %s, keeping the city', async (_name, locate, text) => {
    window.localStorage.setItem('city', 'Казань');
    setGeolocation(locate);
    const onOpenChange = renderModal();
    await setup().click(await screen.findByRole('button', { name: 'Определить автоматически' }));
    expect(await screen.findByRole('status')).toHaveTextContent(text);
    expect(window.localStorage.getItem('city')).toBe('Казань');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('leaves the status empty before any search', async () => {
    renderModal();
    expect(await screen.findByRole('status')).toBeEmptyDOMElement();
  });
});

describe('CityModal automatic search that ends late', () => {
  const pending = () => {
    const answers: { ok?: PositionCallback; fail?: PositionErrorCallback } = {};
    setGeolocation((ok, fail) => {
      answers.ok = ok;
      answers.fail = fail;
    });
    return answers;
  };

  it('closes and keeps a city chosen meanwhile, then stops loading', async () => {
    const answers = pending();
    const onOpenChange = renderModal();
    const button = await screen.findByRole('button', { name: 'Определить автоматически' });
    await setup().click(button);
    act(() => chooseCity('Казань'));
    await act(async () => {
      at(55.7512, 37.6184)(answers.ok!);
    });
    expect(window.localStorage.getItem('city')).toBe('Казань');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(button).toBeEnabled();
  });

  it('chooses the found city but leaves a later opening open after the window went', async () => {
    const answers = pending();
    const first = render(<CityModal cities={CITIES} open onOpenChange={vi.fn()} />);
    await setup().click(await screen.findByRole('button', { name: 'Определить автоматически' }));
    first.unmount();

    const onOpenChange = renderModal();
    await screen.findByRole('dialog');
    await act(async () => {
      at(55.7512, 37.6184)(answers.ok!);
    });
    expect(window.localStorage.getItem('city')).toBe('Москва');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('ignores a late result that is not a city', async () => {
    const answers = pending();
    const onOpenChange = vi.fn();
    const view = render(<CityModal cities={CITIES} open onOpenChange={onOpenChange} />);
    await setup().click(await screen.findByRole('button', { name: 'Определить автоматически' }));
    view.unmount();
    await act(async () => {
      answers.fail!({ code: 1 } as GeolocationPositionError);
    });
    expect(window.localStorage.getItem('city')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('CityModal analytics', () => {
  it('sends city.pick with the flags only', async () => {
    renderModal();
    const user = setup();
    await user.type(await screen.findByRole('searchbox', { name: 'Найти город' }), 'каз');
    await user.click(screen.getByRole('button', { name: 'Казань' }));
    expect(track).toHaveBeenCalledWith('Element Clicked', {
      element: 'city.pick',
      zone: 'header',
      type: 'interaction',
      searched: true,
      had_city: false,
    });
    expect(sent()).not.toContain('Казань');
  });

  it('says on city.pick that a city was already chosen', async () => {
    window.localStorage.setItem('city', 'Москва');
    renderModal();
    await setup().click(await screen.findByRole('button', { name: 'Казань' }));
    expect(track).toHaveBeenCalledWith('Element Clicked', {
      element: 'city.pick',
      zone: 'header',
      type: 'interaction',
      searched: false,
      had_city: true,
    });
  });

  it('sends city.auto and City Located with the button trigger, and no city or position', async () => {
    window.localStorage.setItem('city', 'Казань');
    setGeolocation(at(55.7512, 37.6184));
    renderModal();
    await setup().click(await screen.findByRole('button', { name: 'Определить автоматически' }));
    await vi.waitFor(() =>
      expect(track).toHaveBeenCalledWith('City Located', { result: 'found', trigger: 'button' }),
    );
    expect(track).toHaveBeenCalledWith('Element Clicked', {
      element: 'city.auto',
      zone: 'header',
      type: 'interaction',
      had_city: true,
    });
    expect(sent()).not.toMatch(/Москва|Казань|55\.7|37\.6/);
  });
});
