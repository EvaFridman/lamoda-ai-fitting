import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FittingSuccess } from './fitting-success';

const URL_WITH_SIGNATURE = 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=sig';

describe('FittingSuccess', () => {
  it('announces «Готово!» and where the result was saved, as a status', () => {
    render(<FittingSuccess resultUrl={URL_WITH_SIGNATURE} />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Готово!');
    expect(status).toHaveTextContent('Сохранили в «Мои примерки»');
  });

  it('shows the result as an image src only, with no description', () => {
    const { container } = render(<FittingSuccess resultUrl={URL_WITH_SIGNATURE} />);

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', expect.stringContaining('result.webp'));
    expect(image).toHaveAttribute('alt', '');
    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.getAttributeNames()) {
        if (element.tagName === 'IMG' && attribute === 'src') continue;
        expect(element.getAttribute(attribute)).not.toContain('X-Amz-Signature');
      }
    }
  });

  it('shows the plate with no image while the result is unknown', () => {
    const { container } = render(<FittingSuccess resultUrl={null} />);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Готово!');
  });
});
