import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LAMODA_MARK_PATHS } from '@/shared/ui';

import { StorePin } from './store-pin';

describe('StorePin', () => {
  it('places the white «la» mark on the pin', () => {
    const { container } = render(<StorePin />);
    const mark = container.querySelector('svg svg');

    expect(mark).toHaveAttribute('x', '5.95');
    expect(mark).toHaveAttribute('y', '8');
    expect(mark).toHaveAttribute('width', '20.1055');
    expect(mark).toHaveAttribute('height', '16');
    expect(mark).toHaveAttribute('fill', '#fff');
    expect(Array.from(mark?.querySelectorAll('path') ?? [], (p) => p.getAttribute('d'))).toEqual([
      ...LAMODA_MARK_PATHS,
    ]);
  });

  it('is hidden from assistive technology', () => {
    const { container } = render(<StorePin />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
