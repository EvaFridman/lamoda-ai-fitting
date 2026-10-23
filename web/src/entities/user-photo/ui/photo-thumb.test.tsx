import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PhotoThumb } from './photo-thumb';

const URL_SIGNED = 'https://s3.example/keep/users/u/photo.webp?X-Amz-Signature=abc';
const photo = { url: URL_SIGNED, isDefault: false, width: 768, height: 1024 };

describe('PhotoThumb', () => {
  it('shows the image with the page alt and the signed link as its src', () => {
    render(<PhotoThumb photo={photo} alt="Фото 2" />);
    const image = screen.getByRole('img', { name: 'Фото 2' });
    expect(image).toHaveAttribute('src', URL_SIGNED);
  });

  it('keeps the signed link out of every attribute but src', () => {
    const { container } = render(<PhotoThumb photo={photo} alt="Фото 2" />);
    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.getAttributeNames()) {
        if (element.tagName === 'IMG' && attribute === 'src') continue;
        expect(element.getAttribute(attribute)).not.toContain('X-Amz-Signature');
        expect(element.getAttribute(attribute)).not.toContain('s3.example');
      }
    }
  });

  it('marks its figure mp-block so recordings leave it out', () => {
    render(<PhotoThumb photo={photo} alt="Фото 2" />);
    expect(screen.getByRole('figure')).toHaveClass('mp-block');
  });

  it('shows an empty frame named by the alt, with no img, when the link is null', () => {
    const { container } = render(<PhotoThumb photo={{ ...photo, url: null }} alt="Фото 3" />);
    expect(container.querySelector('img')).toBeNull();
    const frame = screen.getByRole('img', { name: 'Фото 3' });
    expect(frame).not.toHaveAttribute('src');
  });

  it('marks the default photo', () => {
    render(<PhotoThumb photo={{ ...photo, isDefault: true }} alt="Фото 1" />);
    expect(screen.getByText('По умолчанию')).toBeInTheDocument();
  });

  it('has no mark on another photo', () => {
    render(<PhotoThumb photo={photo} alt="Фото 1" />);
    expect(screen.queryByText('По умолчанию')).not.toBeInTheDocument();
  });

  it('marks a default photo with no link as well', () => {
    render(<PhotoThumb photo={{ ...photo, url: null, isDefault: true }} alt="Фото 1" />);
    expect(screen.getByText('По умолчанию')).toBeInTheDocument();
  });

  it('renders the page actions', () => {
    render(
      <PhotoThumb photo={photo} alt="Фото 1">
        <button type="button">Удалить</button>
      </PhotoThumb>,
    );
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
  });
});
