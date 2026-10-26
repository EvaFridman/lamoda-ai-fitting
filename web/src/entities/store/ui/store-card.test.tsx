import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Store } from '../model/schemas';
import { StoreCard, type StoreCardProps } from './store-card';

const store: Store = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  name: 'ТЦ Охта Молл Sport',
  type: 'sport',
  city: 'г. Санкт-Петербург',
  street: 'пр. Шаумяна',
  house: '4',
  mall: 'Охта Молл',
  latitude: 59.93,
  longitude: 30.45,
  metroStations: ['Ладожская', 'Новочеркасская'],
  workTime: 'пн–вс: 10:00–22:00',
  description: 'Вход главный. Этаж 1.',
  phones: ['+7 (917) 599–61–90', '+7 (916) 991–80–72'],
};

function renderCard(props: Partial<StoreCardProps> = {}) {
  const onSelect = vi.fn();
  const onExpandedChange = vi.fn();
  const view = render(
    <StoreCard
      store={store}
      selected={false}
      expanded={false}
      onSelect={onSelect}
      onExpandedChange={onExpandedChange}
      {...props}
    />,
  );
  return { onSelect, onExpandedChange, ...view };
}

const toggle = () => screen.getByRole('button', { name: /Подробнее о магазине/ });
const main = () => screen.getByRole('button', { name: /Шаумяна/ });

describe('StoreCard', () => {
  it('shows the name, the address, the metro stations and the hours', () => {
    renderCard();
    expect(screen.getByText('ТЦ Охта Молл Sport')).toBeVisible();
    expect(screen.getByText('г. Санкт-Петербург, пр. Шаумяна, 4')).toBeVisible();
    expect(screen.getByText('м. Ладожская, Новочеркасская')).toBeVisible();
    expect(screen.getByText('пн–вс: 10:00–22:00')).toBeVisible();
  });

  it('shows no metro line when there is no station', () => {
    renderCard({ store: { ...store, metroStations: [] } });
    expect(screen.queryByText(/^м\. /)).not.toBeInTheDocument();
  });

  it('shows nothing of the details while collapsed', () => {
    renderCard();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Вход главный. Этаж 1.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the description, the phones and the route when expanded', () => {
    renderCard({ expanded: true });
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Вход главный. Этаж 1.')).toBeVisible();
    expect(screen.getByRole('link', { name: '+7 (917) 599–61–90' })).toHaveAttribute(
      'href',
      'tel:+79175996190',
    );
    expect(screen.getByRole('link', { name: '+7 (916) 991–80–72' })).toHaveAttribute(
      'href',
      'tel:+79169918072',
    );
    const route = screen.getByRole('link', { name: 'Проложить маршрут' });
    expect(route).toHaveAttribute('href', 'https://yandex.ru/maps/?rtext=~59.93,30.45&rtt=auto');
    expect(route).toHaveAttribute('target', '_blank');
    expect(route.getAttribute('rel')).toContain('noopener');
  });

  it('shows only the route for a store with no phones', () => {
    renderCard({ expanded: true, store: { ...store, phones: [] } });
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Проложить маршрут');
  });

  it('asks to open the details with «›»', async () => {
    const { onExpandedChange, onSelect } = renderCard();
    await userEvent.setup().click(toggle());
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('asks to close the details with «›» when expanded', async () => {
    const { onExpandedChange } = renderCard({ expanded: true });
    await userEvent.setup().click(toggle());
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });

  it('selects the store from the main area, not opening the details', async () => {
    const { onSelect, onExpandedChange } = renderCard();
    await userEvent.setup().click(main());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onExpandedChange).not.toHaveBeenCalled();
  });

  it.each([true, false])('marks the main area pressed=%s and the card selected', (selected) => {
    const { container } = renderCard({ selected });
    expect(main()).toHaveAttribute('aria-pressed', String(selected));
    const card = container.querySelector('article');
    if (selected) expect(card).toHaveAttribute('data-selected', 'true');
    else expect(card).not.toHaveAttribute('data-selected');
  });

  it('calls the tracked handlers beside the card’s own', async () => {
    const events = {
      card: { onClick: vi.fn() },
      details: { onClick: vi.fn() },
      phone: { onClick: vi.fn() },
      route: { onClick: vi.fn() },
    };
    const { onSelect, onExpandedChange } = renderCard({ expanded: true, events });
    const user = userEvent.setup();

    await user.click(main());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(events.card.onClick).toHaveBeenCalledTimes(1);

    await user.click(toggle());
    expect(onExpandedChange).toHaveBeenCalledWith(false);
    expect(events.details.onClick).toHaveBeenCalledTimes(1);

    const phone = screen.getByRole('link', { name: '+7 (917) 599–61–90' });
    const route = screen.getByRole('link', { name: 'Проложить маршрут' });
    phone.addEventListener('click', (e) => e.preventDefault());
    route.addEventListener('click', (e) => e.preventDefault());
    await user.click(phone);
    await user.click(route);
    expect(events.phone.onClick).toHaveBeenCalledTimes(1);
    expect(events.route.onClick).toHaveBeenCalledTimes(1);
  });
});
