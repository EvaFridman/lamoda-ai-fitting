import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton } from '@/shared/ui';

function skeleton(ui: React.ReactElement) {
  const { container } = render(ui);
  return container.firstElementChild as HTMLElement;
}

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    expect(skeleton(<Skeleton height={20} />)).toHaveAttribute('aria-hidden', 'true');
  });

  it('is as wide as its parent by default, with square corners', () => {
    expect(skeleton(<Skeleton height={20} />)).toHaveStyle({
      width: '100%',
      height: '20px',
      borderRadius: '0px',
    });
  });

  it('takes numbers as pixels', () => {
    expect(skeleton(<Skeleton width={48} height={32} radius={4} />)).toHaveStyle({
      width: '48px',
      height: '32px',
      borderRadius: '4px',
    });
  });

  it('takes strings as they are', () => {
    expect(skeleton(<Skeleton width="60%" height="50%" radius="50%" />)).toHaveStyle({
      width: '60%',
      height: '50%',
      borderRadius: '50%',
    });
  });

  it('adds a given class name', () => {
    expect(skeleton(<Skeleton height={1} className="extra" />)).toHaveClass('extra');
  });
});
