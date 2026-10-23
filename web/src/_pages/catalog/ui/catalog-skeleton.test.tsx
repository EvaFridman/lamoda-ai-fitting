import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CatalogSkeleton } from './catalog-skeleton';

describe('CatalogSkeleton', () => {
  it('tells a screen reader that the products load', () => {
    render(<CatalogSkeleton title="Каталог" />);
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем товары');
  });

  it('shows the title as the heading, with no count text, when the title is known', () => {
    render(<CatalogSkeleton title="Платья" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Платья$/);
  });

  it('has no heading when the title is not known yet', () => {
    render(<CatalogSkeleton />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем товары');
  });

  it('holds the chips, the filters button and the category column; the CSS picks by width', () => {
    const { container } = render(<CatalogSkeleton title="Каталог" />);
    expect(container.querySelector('.skeletonChips')).toBeInTheDocument();
    expect(container.querySelector('.skeletonFiltersButton')).toBeInTheDocument();
    const column = container.querySelector('.aside');
    expect(column).toBeInTheDocument();
    expect(column?.querySelectorAll('.skeletonCategories > *')).toHaveLength(8);
  });

  it('holds the grid placeholders and no link or button to use', () => {
    const { container } = render(<CatalogSkeleton title="Каталог" />);
    expect(container.querySelectorAll('ul > li').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
