import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Rating } from '@/shared/ui';

describe('Rating', () => {
  it('is one image named with a decimal comma, showing the value with a dot', () => {
    render(<Rating value={4.7} />);

    const rating = screen.getByRole('img', { name: 'Рейтинг 4,7 из 5' });
    expect(rating).toHaveTextContent('4.7');
  });

  it('shows a whole value with one decimal', () => {
    render(<Rating value={5} />);

    expect(screen.getByRole('img', { name: 'Рейтинг 5,0 из 5' })).toHaveTextContent('5.0');
  });

  it('renders nothing without a value', () => {
    const missing = render(<Rating />);
    expect(missing.container).toBeEmptyDOMElement();
    missing.unmount();

    const empty = render(<Rating value={null} />);
    expect(empty.container).toBeEmptyDOMElement();
  });

  it('shows a rating of zero', () => {
    render(<Rating value={0} />);

    expect(screen.getByRole('img', { name: 'Рейтинг 0,0 из 5' })).toHaveTextContent('0.0');
  });
});
