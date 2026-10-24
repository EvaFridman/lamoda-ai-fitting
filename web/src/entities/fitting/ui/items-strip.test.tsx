import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ItemsStrip } from './items-strip';

function items(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    productId: `00000000-0000-4000-8000-00000000000${index}`,
    imageUrl: `https://lamoda.test/media/p${index}.jpg`,
  }));
}

describe('ItemsStrip', () => {
  it('shows every item up to three, with no «+N»', () => {
    const { container } = render(<ItemsStrip items={items(3)} />);

    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('shows three thumbnails and «+2» for five items', () => {
    const { container } = render(<ItemsStrip items={items(5)} />);

    const sources = Array.from(container.querySelectorAll('img'), (img) => img.getAttribute('src'));
    expect(sources).toEqual([
      'https://lamoda.test/media/p0.jpg',
      'https://lamoda.test/media/p1.jpg',
      'https://lamoda.test/media/p2.jpg',
    ]);
    expect(screen.getByText('+2')).toHaveAccessibleName('ещё 2');
  });

  it('shows «+1» for four items', () => {
    render(<ItemsStrip items={items(4)} />);

    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('keeps a place for an item without a picture', () => {
    const { container } = render(
      <ItemsStrip
        items={[{ productId: '00000000-0000-4000-8000-000000000001', imageUrl: null }]}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(container.querySelector('img')).toBeNull();
  });
});
