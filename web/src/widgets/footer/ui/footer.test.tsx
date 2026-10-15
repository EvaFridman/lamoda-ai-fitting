import { screen, within } from '@testing-library/react';
import { prerender } from 'react-dom/static';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ APP_VERSION: '1.2.3-test' }),
}));

import { footerColumns } from '../config/items';
import { Footer } from './footer';

// The client renderer does not wait for the async `AppVersion`; the static one does, so the
// footer is rendered to HTML (as on the server) and put into the document.
async function renderFooter() {
  const { prelude } = await prerender(<Footer />);
  document.body.innerHTML = await new Response(prelude).text();
}

const EXPECTED_ITEMS = [
  [
    'Мои заказы',
    'Условия доставки',
    'Магазины Lamoda Sport',
    'Возврат',
    'Как оформить заказ',
    'Как выбрать размер',
    'Центр поддержки Lamoda',
    'Lamoda о мошенничестве',
    'Часто задаваемые вопросы',
    'Lamoda club',
    'Подарочные карты',
    'Чат с поддержкой',
  ],
  ['Новости компании', 'Устойчивое развитие', 'Журнал', 'Вакансии', 'Статьи'],
  [
    'Lamoda Seller Academy — База знаний для продавцов и партнеров',
    'Стать продавцом маркетплейса',
    'Продвижение на Lamoda',
    'Стать подрядчиком Lamoda',
    'Стать подрядчиком для складских операций',
    'Стать подрядчиком транспортных услуг',
    'Стать подрядчиком для ремонта и эксплуатации ПВЗ',
    'Арендодателям',
    'Подарочные сертификаты для бизнеса',
    'Стать участником Lamoda Fashion Accelerator',
  ],
  [
    'Публичная оферта',
    'Пользовательское соглашение',
    'Сотрудничество',
    'Политика по работе с персональными данными',
    'Конфиденциальная информация',
    'Комплаенс',
    'Устойчивое развитие',
  ],
];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Footer', () => {
  it('has the four columns with 12, 5, 10 and 7 items', () => {
    expect(footerColumns.map((column) => column.items.length)).toEqual([12, 5, 10, 7]);
    expect(footerColumns.map((column) => column.title)).toEqual([
      'Помощь',
      'О нас',
      'Партнерам',
      'Правовая информация',
    ]);
  });

  it('renders every column title and every item', async () => {
    await renderFooter();

    for (const column of footerColumns) {
      expect(screen.getByRole('heading', { level: 2, name: column.title })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(4);
    expect(screen.getAllByRole('listitem')).toHaveLength(12 + 5 + 10 + 7);

    const lists = screen.getAllByRole('list');
    footerColumns.forEach((column, index) => {
      const items = within(lists[index]!).getAllByRole('listitem');
      expect(items.map((item) => item.textContent)).toEqual(column.items.map((i) => i.label));
    });

    // The expected lists are written out (spec 0008 plan §6), so a typo or reorder in items.ts fails.
    const rendered = lists.map((list) =>
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    );
    expect(rendered).toEqual(EXPECTED_ITEMS);

    expect(screen.getByText('Мои заказы')).toBeInTheDocument();
    expect(screen.getByText('Стать продавцом маркетплейса')).toBeInTheDocument();
    expect(screen.getByText('Публичная оферта')).toBeInTheDocument();
  });

  it('has exactly one link, to the privacy policy', async () => {
    await renderFooter();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Политика по работе с персональными данными');
    expect(links[0]).toHaveAttribute('href', '/privacy');
  });

  it('shows other payment methods and the mobile version as text, not links', async () => {
    await renderFooter();

    expect(screen.getByText('другие способы оплаты')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /способы оплаты/ })).not.toBeInTheDocument();
    expect(screen.getByText('Мобильная версия')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Мобильная версия/ })).not.toBeInTheDocument();
  });

  it('names the VK, Mastercard and Visa images', async () => {
    await renderFooter();

    expect(screen.getByRole('img', { name: 'VK' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Mastercard' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Visa' })).toBeInTheDocument();
  });

  it('keeps the bottom row out of the column lists, in order, with the version last', async () => {
    await renderFooter();

    const outsideColumns = [
      screen.getByRole('img', { name: 'VK' }),
      screen.getByRole('img', { name: 'Mastercard' }),
      screen.getByRole('img', { name: 'Visa' }),
      screen.getByText('другие способы оплаты'),
      screen.getByText('Мобильная версия'),
    ];
    for (const element of outsideColumns) {
      expect(element.closest('ul')).toBeNull();
      expect(element.closest('section')).toBeNull();
    }

    const mastercard = screen.getByRole('img', { name: 'Mastercard' });
    const visa = screen.getByRole('img', { name: 'Visa' });
    expect(
      mastercard.compareDocumentPosition(visa) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent?.endsWith('версия 1.2.3-test')).toBe(true);
  });

  it('does not mention Россия or МИР', async () => {
    await renderFooter();

    expect(screen.queryByText(/Россия/)).not.toBeInTheDocument();
    expect(screen.queryByText(/МИР/)).not.toBeInTheDocument();
  });

  it('shows the deployed version', async () => {
    await renderFooter();

    expect(screen.getByRole('contentinfo')).toHaveTextContent('версия 1.2.3-test');
  });
});
