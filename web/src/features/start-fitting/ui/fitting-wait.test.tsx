import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Fitting } from '@/entities/fitting';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/shared/analytics/client', () => ({ identify: vi.fn(), reset: vi.fn(), track }));

import { FittingWait } from './fitting-wait';

const START = '2026-10-20T12:00:00.000Z';

function fitting(patch: Partial<Fitting> = {}): Fitting {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    kind: 'single',
    parentId: null,
    status: 'processing',
    stage: 'generating',
    failureCode: null,
    failureCategory: null,
    failureStage: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items: [
      {
        productId: '00000000-0000-4000-8000-0000000000a1',
        name: 'Сарафан на бретелях',
        brand: 'Brand',
        imageUrl: 'https://cdn.example/dress.jpg',
        price: 5000,
        finalPrice: 4500,
        attributeValueId: null,
        colour: 'Красный',
        slot: 'top',
      },
    ],
    promptText: null,
    photoId: '00000000-0000-4000-8000-0000000000f1',
    resultUrl: null,
    createdAt: START,
    startedAt: START,
    finishedAt: null,
    estimatedSeconds: 20,
    ...patch,
  };
}

function stubPhone() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(width < 600px)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  track.mockReset();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(Date.parse(START));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FittingWait', () => {
  it('shows the first stage, zero percent and the time left of the estimate', () => {
    render(<FittingWait fitting={fitting()} photoUrl={null} onClose={vi.fn()} />);

    expect(screen.getByText('Примеряем…')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('Осталось около 20 секунд')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Прогресс примерки' })).toBeInTheDocument();
  });

  it('lists the stages of the wide screen: the first done, the current one named for the item', () => {
    render(<FittingWait fitting={fitting()} photoUrl={null} onClose={vi.fn()} />);

    const steps = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(steps).toEqual([
      'Проверили фото',
      'Определяем позу и фигуру',
      'Надеваем сарафан на бретелях',
      'Прорисовываем детали',
    ]);
  });

  it('moves to the next stage as time passes, marking the earlier ones done', () => {
    render(<FittingWait fitting={fitting()} photoUrl={null} onClose={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    const steps = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(steps).toEqual([
      'Проверили фото',
      'Определили позу и фигуру',
      'Надеваем сарафан на бретелях',
      'Прорисовываем детали',
    ]);
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('Осталось около 12 секунд')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Проверили фото',
      'Определили позу и фигуру',
      'Надели сарафан на бретелях',
      'Прорисовываем детали',
    ]);
  });

  it('says it is almost ready once the estimate is past, below 100 percent', () => {
    render(<FittingWait fitting={fitting()} photoUrl={null} onClose={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('Почти готово')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('names the item and its colour', () => {
    render(<FittingWait fitting={fitting()} photoUrl={null} onClose={vi.fn()} />);

    expect(screen.getByText('Сарафан на бретелях')).toBeInTheDocument();
    expect(screen.getByText('Красный')).toBeInTheDocument();
  });

  it('says the page can be closed', () => {
    render(<FittingWait fitting={fitting()} photoUrl={null} onClose={vi.fn()} />);

    expect(
      screen.getByText(/Можно закрыть страницу — результат сохранится в истории/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Пришлём уведомление/)).toBeInTheDocument();
  });

  it('closes the window from «Закрыть и продолжить покупки» and tracks the click', async () => {
    vi.useRealTimers();
    const onClose = vi.fn();
    render(<FittingWait fitting={fitting()} photoUrl={null} onClose={onClose} />);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Закрыть и продолжить покупки' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'try-on.close', screen: 'wait' }),
    );
  });

  describe('of a look', () => {
    const lookItem = (n: number, name: string) => ({
      productId: `00000000-0000-4000-8000-00000000010${n}`,
      name,
      brand: 'Brand',
      imageUrl: `https://cdn.example/p${n}.jpg`,
      price: 5000,
      finalPrice: 4500,
      attributeValueId: null,
      colour: 'Красный',
      slot: n === 1 ? ('top' as const) : ('bottom' as const),
    });
    const look = () =>
      fitting({ kind: 'look', items: [lookItem(1, 'Тренч Nord'), lookItem(2, 'Брюки Lux')] });

    it('names the look, not an item, in the stage and shows no single item block', () => {
      render(<FittingWait fitting={look()} photoUrl={null} onClose={vi.fn()} />);

      expect(screen.getByText('Надеваем образ')).toBeInTheDocument();
      expect(screen.queryByText('Тренч Nord')).not.toBeInTheDocument();
      expect(screen.queryByText('Красный')).not.toBeInTheDocument();
    });

    it('shows the strip of the items under the bar', () => {
      render(<FittingWait fitting={look()} photoUrl={null} onClose={vi.fn()} />);

      const lists = screen.getAllByRole('list');
      const strip = lists.find((list) => list.querySelectorAll('img').length === 2);
      expect(strip).toBeDefined();
      expect(strip?.querySelectorAll('li')).toHaveLength(2);
    });

    it('does not show the strip for a single fitting', () => {
      render(<FittingWait fitting={fitting()} photoUrl={null} onClose={vi.fn()} />);

      expect(screen.getAllByRole('list')).toHaveLength(1);
    });
  });

  describe('on a phone', () => {
    beforeEach(stubPhone);

    it('shows the current stage alone, with «Свернуть» in place of the long button', () => {
      render(<FittingWait fitting={fitting()} photoUrl={null} onClose={vi.fn()} />);

      expect(screen.getByText('Определяем позу и фигуру')).toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.queryByText('Примеряем…')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Свернуть' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Закрыть и продолжить покупки' }),
      ).not.toBeInTheDocument();
    });

    it('closes the window from «Свернуть»', async () => {
      vi.useRealTimers();
      const onClose = vi.fn();
      render(<FittingWait fitting={fitting()} photoUrl={null} onClose={onClose} />);

      await userEvent.setup().click(screen.getByRole('button', { name: 'Свернуть' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
