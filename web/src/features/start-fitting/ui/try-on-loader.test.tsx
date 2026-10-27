import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TryOnLoader } from '@/features/start-fitting';

describe('TryOnLoader', () => {
  it('shows the photo and the children inside an mp-block frame', () => {
    const { container } = render(
      <TryOnLoader photoUrl="https://s3.test/photo.webp">
        <p>Примеряем</p>
      </TryOnLoader>,
    );

    const frame = screen.getByText('Примеряем').parentElement;
    expect(frame).toHaveClass('mp-block');
    expect(container.firstElementChild).toBe(frame);
    const image = frame?.querySelector('img');
    expect(image).toHaveAttribute('src', expect.stringContaining('photo.webp'));
  });

  it('shows no image without a photo, only the children', () => {
    const { container } = render(
      <TryOnLoader photoUrl={null}>
        <p>Примеряем</p>
      </TryOnLoader>,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Примеряем').parentElement).toHaveClass('mp-block');
  });
});
