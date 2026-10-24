import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { HistoryCard, itemLabel, kindBadge } from './history-card';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');
const RESULT = 'https://s3.test/keep/users/u/r.webp?X-Amz-Signature=sig';

function item(n: number, colour: string | null = null) {
  return {
    productId: `00000000-0000-4000-8000-00000000000${n}`,
    name: `Рубашка ${n}`,
    brand: 'Annen',
    imageUrl: `https://lamoda.test/media/p${n}.jpg`,
    price: 1000,
    finalPrice: 900,
    attributeValueId: null,
    colour,
  };
}

function fitting(overrides: Partial<Parameters<typeof HistoryCard>[0]['fitting']> = {}) {
  return {
    kind: 'single' as const,
    parentId: null,
    status: 'completed' as const,
    items: [item(1, 'белый')],
    resultUrl: RESULT,
    createdAt: '2026-10-24T11:06:00.000Z',
    ...overrides,
  };
}

describe('kindBadge', () => {
  it('says «Перегенерация» for a regeneration, whatever its kind', () => {
    expect(kindBadge({ kind: 'single', parentId: 'x' })).toBe('Перегенерация');
    expect(kindBadge({ kind: 'look', parentId: 'x' })).toBe('Перегенерация');
  });

  it('says «Образ» for a look and nothing for one item', () => {
    expect(kindBadge({ kind: 'look', parentId: null })).toBe('Образ');
    expect(kindBadge({ kind: 'single', parentId: null })).toBeNull();
  });
});

describe('itemLabel', () => {
  it('joins the name and the colour', () => {
    expect(itemLabel({ name: 'Рубашка Annen', colour: 'белый' })).toBe('Рубашка Annen · белый');
  });

  it('is the name alone with no colour', () => {
    expect(itemLabel({ name: 'Рубашка Annen', colour: null })).toBe('Рубашка Annen');
  });
});

describe('HistoryCard', () => {
  it('shows the result, the «ИИ» badge, the item with its colour and the date', () => {
    render(<HistoryCard fitting={fitting()} onOpen={vi.fn()} now={NOW} />);

    expect(screen.getByText('ИИ')).toBeInTheDocument();
    expect(screen.getByText('Рубашка 1 · белый')).toBeInTheDocument();
    expect(screen.getByText('Сегодня, 14:06')).toBeInTheDocument();
    expect(screen.queryByText('Образ')).not.toBeInTheDocument();
    expect(screen.queryByText('Перегенерация')).not.toBeInTheDocument();
  });

  it('shows the kind badge for a look and a regeneration', () => {
    const look = fitting({ kind: 'look', items: [item(1), item(2)] });
    const { rerender } = render(<HistoryCard fitting={look} onOpen={vi.fn()} now={NOW} />);
    expect(screen.getByText('Образ')).toBeInTheDocument();
    expect(screen.queryByText('Рубашка 1')).not.toBeInTheDocument();

    rerender(<HistoryCard fitting={{ ...look, parentId: 'p' }} onOpen={vi.fn()} now={NOW} />);
    expect(screen.getByText('Перегенерация')).toBeInTheDocument();
    expect(screen.queryByText('Образ')).not.toBeInTheDocument();
  });

  it.each(['pending', 'processing'] as const)(
    'a %s fitting shows the wait and no picture',
    (status) => {
      const { container } = render(
        <HistoryCard fitting={fitting({ status, resultUrl: null })} onOpen={vi.fn()} now={NOW} />,
      );

      expect(screen.getByText('Готовим примерку…')).toBeInTheDocument();
      expect(screen.queryByText('ИИ')).not.toBeInTheDocument();
      expect(container.querySelector('.frame img')).toBeNull();
    },
  );

  it('a failed fitting shows «Не получилось» and no picture', () => {
    const { container } = render(
      <HistoryCard
        fitting={fitting({ status: 'failed', resultUrl: null })}
        onOpen={vi.fn()}
        now={NOW}
      />,
    );

    expect(screen.getByText('Не получилось')).toBeInTheDocument();
    expect(screen.queryByText('ИИ')).not.toBeInTheDocument();
    expect(container.querySelector('.frame img')).toBeNull();
  });

  it('a completed fitting without a link has no picture and no badge', () => {
    const { container } = render(
      <HistoryCard fitting={fitting({ resultUrl: null })} onOpen={vi.fn()} now={NOW} />,
    );

    expect(screen.queryByText('ИИ')).not.toBeInTheDocument();
    expect(container.querySelector('.frame img')).toBeNull();
  });

  it('puts the result link only into the image src, inside an mp-block container', () => {
    const { container } = render(<HistoryCard fitting={fitting()} onOpen={vi.fn()} now={NOW} />);

    const image = container.querySelector('.frame img');
    expect(image).toHaveAttribute('src', RESULT);
    expect(image?.closest('.mp-block')).not.toBeNull();
    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.getAttributeNames()) {
        if (element === image && attribute === 'src') continue;
        expect(element.getAttribute(attribute)).not.toContain('X-Amz-Signature');
        expect(element.getAttribute(attribute)).not.toContain('s3.test');
      }
    }
  });

  it('opens the fitting from the picture and reports the click', async () => {
    const onOpen = vi.fn();
    const onClick = vi.fn();
    render(<HistoryCard fitting={fitting()} onOpen={onOpen} openEvents={{ onClick }} now={NOW} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Открыть примерку' }));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('opens with no events given', async () => {
    const onOpen = vi.fn();
    render(<HistoryCard fitting={fitting()} onOpen={onOpen} now={NOW} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Открыть примерку' }));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows the actions the page gives, next to the picture button', () => {
    render(
      <HistoryCard
        fitting={fitting()}
        onOpen={vi.fn()}
        actions={<button type="button">Действия</button>}
        now={NOW}
      />,
    );

    expect(screen.getByRole('button', { name: 'Действия' })).toBeInTheDocument();
  });
});
