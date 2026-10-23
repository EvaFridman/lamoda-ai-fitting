import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StateCard } from './state-card';

describe('StateCard', () => {
  it('renders the title as an h2 by default', () => {
    render(<StateCard title="Здесь появятся ваши фото" />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Здесь появятся ваши фото' }),
    ).toBeVisible();
  });

  it.each([3, 4] as const)('renders the title as an h%s when asked', (level) => {
    render(<StateCard title="Заголовок" titleAs={`h${level}`} />);
    expect(screen.getByRole('heading', { level, name: 'Заголовок' })).toBeInTheDocument();
  });

  it('is a section', () => {
    const { container } = render(<StateCard title="Заголовок" />);
    expect(container.querySelector('section')).not.toBeNull();
  });

  it('shows the icon, the text and the actions', () => {
    render(
      <StateCard
        title="Заголовок"
        icon={<svg data-testid="icon" />}
        actions={<button type="button">Повторить</button>}
      >
        Объяснение
      </StateCard>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('Объяснение')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('renders only the title when the rest is missing', () => {
    const { container } = render(<StateCard title="Заголовок" />);
    expect(container.querySelector('section')?.children).toHaveLength(1);
  });
});
