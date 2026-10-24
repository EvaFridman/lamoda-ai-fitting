import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LimitMeter, triesLeftText } from './limit-meter';

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
