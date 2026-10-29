import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PhotoTips } from './photo-tips';

const GOOD = ['В полный рост, хороший свет', 'Простая или облегающая одежда, лицом к камере'];
const BAD = [
  'Слишком темно',
  'Не в полный рост',
  'Больше одного человека',
  'Дети на фото',
  'Объёмная одежда скрывает фигуру',
];

describe('PhotoTips', () => {
  it('draws seven tiles, each with its caption and a decorative pictogram', () => {
    render(<PhotoTips />);

    const figures = screen.getAllByRole('figure');
    expect(figures).toHaveLength(7);
    expect(figures.map((figure) => figure.querySelector('figcaption')?.textContent)).toEqual([
      ...GOOD,
      ...BAD,
    ]);
    for (const figure of figures) {
      const pictogram = figure.querySelector('svg');
      expect(pictogram).not.toBeNull();
      expect(pictogram).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('marks the two good tiles «Подойдёт» and the five bad ones «Не подойдёт»', () => {
    render(<PhotoTips />);

    expect(screen.getAllByRole('img', { name: 'Подойдёт' })).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: 'Не подойдёт' })).toHaveLength(5);
    for (const caption of GOOD) {
      const figure = screen.getByText(caption).closest('figure')!;
      expect(within(figure).getByRole('img', { name: 'Подойдёт' })).toBeInTheDocument();
    }
    for (const caption of BAD) {
      const figure = screen.getByText(caption).closest('figure')!;
      expect(within(figure).getByRole('img', { name: 'Не подойдёт' })).toBeInTheDocument();
    }
  });

  it('with summary={false} draws the seven tiles and no «Коротко» list', () => {
    render(<PhotoTips summary={false} />);

    expect(screen.getAllByRole('figure')).toHaveLength(7);
    expect(screen.queryByRole('heading', { name: 'Коротко' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('JPG, PNG, WebP или HEIC до 20 МБ')).not.toBeInTheDocument();
  });

  it('ends in the «Коротко» list of five lines, the format line last and naming HEIC (AC27)', () => {
    render(<PhotoTips />);

    expect(screen.getByRole('heading', { name: 'Коротко' })).toBeInTheDocument();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items.at(-1)).toHaveTextContent('JPG, PNG, WebP или HEIC до 20 МБ');
  });
});
