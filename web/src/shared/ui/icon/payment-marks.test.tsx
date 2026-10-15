import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MastercardMark, VisaMark } from '@/shared/ui';

describe.each([
  ['VisaMark', VisaMark, 'Visa', 62, 21],
  ['MastercardMark', MastercardMark, 'Mastercard', 39, 25],
] as const)('%s', (_name, Mark, title, width, height) => {
  it('is an image named by its title', () => {
    render(<Mark title={title} />);

    const image = screen.getByRole('img', { name: title });
    expect(image.querySelector('title')).toHaveTextContent(title);
  });

  it('has a fixed size and a viewBox of the same size', () => {
    render(<Mark title={title} />);

    const image = screen.getByRole('img', { name: title });
    expect(image).toHaveAttribute('width', String(width));
    expect(image).toHaveAttribute('height', String(height));
    expect(image).toHaveAttribute('viewBox', `0 0 ${width} ${height}`);
  });

  it('keeps a given class next to its own', () => {
    render(<Mark title={title} className="extra" />);

    expect(screen.getByRole('img', { name: title })).toHaveClass('icon', 'extra');
  });
});
