import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WaitItems } from './wait-items';

const item = (
  n: number,
  patch: Partial<Parameters<typeof WaitItems>[0]['items'][number]> = {},
) => ({
  productId: `00000000-0000-4000-8000-00000000010${n}`,
  imageUrl: `https://cdn.example/p${n}.jpg`,
  name: `Вещь ${n}`,
  colour: 'Красный',
  ...patch,
});

describe('WaitItems', () => {
  it('shows a single item’s picture with its name and colour', () => {
    const { container } = render(<WaitItems items={[item(1)]} />);

    expect(screen.getByText('Вещь 1')).toBeInTheDocument();
    expect(screen.getByText('Красный')).toBeInTheDocument();
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://cdn.example/p1.jpg');
  });

  it('leaves the colour out when the item has none', () => {
    render(<WaitItems items={[item(1, { colour: null })]} />);

    expect(screen.getByText('Вещь 1')).toBeInTheDocument();
    expect(screen.queryByText('Красный')).not.toBeInTheDocument();
  });

  it('shows every picture of a look in one list, naming none', () => {
    const items = [1, 2, 3, 4, 5].map((n) => item(n));
    render(<WaitItems items={items} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(document.querySelectorAll('img')).toHaveLength(5);
    expect(screen.queryByText('Вещь 1')).not.toBeInTheDocument();
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it('draws an empty slot for an item with no picture', () => {
    render(<WaitItems items={[item(1, { imageUrl: null })]} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(document.querySelector('img')).toBeNull();
  });
});
