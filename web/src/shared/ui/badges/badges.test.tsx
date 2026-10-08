import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badges } from '@/shared/ui';

describe('Badges', () => {
  it('shows every label in the given order', () => {
    const { container } = render(
      <Badges
        badges={[
          { tone: 'discount', label: '−40%' },
          { tone: 'club', label: '−7% club' },
        ]}
      />,
    );

    expect(container.textContent).toBe('−40%−7% club');
    expect(screen.getByText('−40%')).toBeInTheDocument();
    expect(screen.getByText('−7% club')).toBeInTheDocument();
  });

  it('gives each badge the class of its tone', () => {
    render(
      <Badges
        badges={[
          { tone: 'discount', label: 'a' },
          { tone: 'club', label: 'b' },
          { tone: 'premium', label: 'c' },
          { tone: 'promo', label: 'd' },
        ]}
      />,
    );

    expect(screen.getByText('a').parentElement).toHaveClass('discount');
    expect(screen.getByText('b').parentElement).toHaveClass('club');
    expect(screen.getByText('c').parentElement).toHaveClass('premium');
    expect(screen.getByText('d').parentElement).toHaveClass('promo');
    expect(screen.getByText('a').parentElement).not.toHaveClass('club');
  });

  it('is large only with size="l"', () => {
    const small = render(<Badges badges={[{ tone: 'promo', label: 'x' }]} />);
    expect(small.container.firstElementChild).not.toHaveClass('l');
    small.unmount();

    const large = render(<Badges size="l" badges={[{ tone: 'promo', label: 'x' }]} />);
    expect(large.container.firstElementChild).toHaveClass('l');
  });
});
