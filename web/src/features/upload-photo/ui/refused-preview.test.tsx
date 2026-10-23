import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RefusedPreview } from './refused-preview';

const createObjectURL = vi.fn<(file: File) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();

const picture = (name = 'me.jpg') => new File(['x'], name, { type: 'image/jpeg' });

beforeEach(() => {
  vi.clearAllMocks();
  createObjectURL.mockReturnValue('blob:preview-1');
  // jsdom has no object URLs.
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('RefusedPreview', () => {
  it('shows the chosen file as an image whose src is its object URL', () => {
    const file = picture();
    render(<RefusedPreview file={file} hidden={false} />);

    const image = screen.getByRole('img', { name: 'Загруженное фото' });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(image).toHaveAttribute('src', 'blob:preview-1');
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('keeps the photo in a recorder-blocked frame and its link in no other attribute', () => {
    const { container } = render(<RefusedPreview file={picture()} hidden={false} />);

    const image = screen.getByRole('img', { name: 'Загруженное фото' });
    expect(image.closest('.mp-block')).not.toBeNull();
    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.getAttributeNames()) {
        if (element === image && attribute === 'src') continue;
        expect(element.getAttribute(attribute)).not.toContain('blob:');
      }
    }
  });

  it('revokes the URL and empties the src when it goes', () => {
    const { unmount } = render(<RefusedPreview file={picture()} hidden={false} />);
    const image = screen.getByRole('img', { name: 'Загруженное фото' });

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(image).not.toHaveAttribute('src');
  });

  it('revokes the old URL and makes a new one when the file changes', () => {
    const second = picture('second.jpg');
    const { rerender } = render(<RefusedPreview file={picture('first.jpg')} hidden={false} />);
    createObjectURL.mockReturnValue('blob:preview-2');

    rerender(<RefusedPreview file={second} hidden={false} />);

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(createObjectURL).toHaveBeenLastCalledWith(second);
    expect(screen.getByRole('img', { name: 'Загруженное фото' })).toHaveAttribute(
      'src',
      'blob:preview-2',
    );
  });

  it('hidden shows «Фото скрыто», no image and makes no URL', () => {
    render(<RefusedPreview file={picture()} hidden />);

    expect(screen.getByText('Фото скрыто')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('revokes the URL when the photo becomes hidden', () => {
    const { rerender } = render(<RefusedPreview file={picture()} hidden={false} />);

    rerender(<RefusedPreview file={picture()} hidden />);

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
