import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LimitMeter, triesLeftOfText, triesLeftText, triesLeftTail } from './limit-meter';

describe('triesLeftOfText', () => {
  it.each([
    [11, 40, 'Осталось 11 из 40 примерок в этом месяце'],
    [1, 1, 'Осталась 1 из 1 примерки в этом месяце'],
    [21, 21, 'Осталась 21 из 21 примерки в этом месяце'],
    [5, 22, 'Осталось 5 из 22 примерок в этом месяце'],
    [0, 40, 'Примерки закончились'],
    [-1, 40, 'Примерки закончились'],
  ])('%i left of %i reads «%s»', (left, limit, text) => {
    expect(triesLeftOfText(left, limit)).toBe(text);
  });
});
describe('triesLeftText', () => {
  it.each([
    [12, 'Осталось 12 примерок в этом месяце'],
    [21, 'Осталась 21 примерка в этом месяце'],
    [4, 'Осталось 4 примерки в этом месяце'],
    [3, 'Осталось 3 — мало'],
    [2, 'Осталось 2 — мало'],
    [1, 'Осталась 1 — мало'],
    [0, 'Примерки закончились'],
    [-1, 'Примерки закончились'],
  ])('%i left reads «%s»', (left, text) => {
    expect(triesLeftText(left)).toBe(text);
  });
});

describe('triesLeftTail', () => {
  it.each([
    [1, 'осталась 1 в этом месяце'],
    [2, 'осталось 2 в этом месяце'],
    [5, 'осталось 5 в этом месяце'],
    [21, 'осталась 21 в этом месяце'],
    [0, 'примерки закончились'],
    [-1, 'примерки закончились'],
  ])('%i left reads «%s»', (left, text) => {
    expect(triesLeftTail(left)).toBe(text);
  });
});

describe('LimitMeter', () => {
  it('shows the text of the tries left', () => {
    render(<LimitMeter left={12} limit={20} />);
    expect(screen.getByText('Осталось 12 примерок в этом месяце')).toBeInTheDocument();
  });

  it('shows the given text in place of the default', () => {
    render(
      <LimitMeter left={12} limit={20}>
        Своя подпись
      </LimitMeter>,
    );
    expect(screen.getByText('Своя подпись')).toBeInTheDocument();
    expect(screen.queryByText(/Осталось/)).not.toBeInTheDocument();
  });

  it('turns to the caution look at three tries left or fewer, not at four', () => {
    const { container, rerender } = render(<LimitMeter left={4} limit={20} />);
    expect(container.firstElementChild).not.toHaveClass('few');
    rerender(<LimitMeter left={3} limit={20} />);
    expect(container.firstElementChild).toHaveClass('few');
    rerender(<LimitMeter left={0} limit={20} />);
    expect(container.firstElementChild).toHaveClass('few');
  });

  it('puts the text, the bar and the caption one under another when stacked', () => {
    const { container } = render(
      <LimitMeter left={10} limit={40} layout="stacked" caption="Обновится 1 ноября">
        Осталось 10 из 40 примерок
      </LimitMeter>,
    );
    const meter = container.firstElementChild as HTMLElement;
    expect(meter).toHaveClass('stacked');
    expect(Array.from(meter.children).map((child) => child.className)).toEqual([
      '',
      'bar',
      'caption',
    ]);
    expect(screen.getByText('Обновится 1 ноября')).toBeInTheDocument();
    expect(container.querySelector('.fill')).toHaveStyle({ width: '25%' });
  });

  it('keeps the bar first and shows no caption in the row layout', () => {
    const { container } = render(<LimitMeter left={11} limit={40} caption="Обновится 1 ноября" />);
    expect(container.firstElementChild).not.toHaveClass('stacked');
    expect(container.firstElementChild?.firstElementChild).toHaveClass('bar');
    expect(screen.queryByText('Обновится 1 ноября')).not.toBeInTheDocument();
  });

  it('fills the bar by the share left, within 0 and 100 %', () => {
    const { container, rerender } = render(<LimitMeter left={5} limit={20} />);
    const fill = () => container.querySelector('.fill');
    expect(fill()).toHaveStyle({ width: '25%' });
    rerender(<LimitMeter left={30} limit={20} />);
    expect(fill()).toHaveStyle({ width: '100%' });
    rerender(<LimitMeter left={5} limit={0} />);
    expect(fill()).toHaveStyle({ width: '0%' });
  });
});
