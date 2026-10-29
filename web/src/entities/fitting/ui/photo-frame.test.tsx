import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PhotoFrame } from './photo-frame';

describe('PhotoFrame', () => {
  it('holds its children in an mp-block box with the caller class', () => {
    render(
      <PhotoFrame className="mine">
        <span>Фото</span>
      </PhotoFrame>,
    );

    const frame = screen.getByText('Фото').parentElement;
    expect(frame).toHaveClass('mp-block', 'mine');
  });

  it('is mp-block without a caller class', () => {
    render(
      <PhotoFrame>
        <span>Фото</span>
      </PhotoFrame>,
    );

    const frame = screen.getByText('Фото').parentElement;
    expect(frame).toHaveClass('mp-block');
    expect(frame?.className).not.toContain('undefined');
  });
});
