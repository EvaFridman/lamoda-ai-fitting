import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CatalogCategoryList, type CatalogCategory } from './catalog-category-list';

const categories: CatalogCategory[] = [
  { id: 'c1', name: 'Куртки', count: 12 },
  { id: 'c2', name: 'Джинсы', count: 0 },
  { id: 'c3', name: 'Платья', count: 5 },
];

const getHref = (id: string) => `/catalog?category=${id}`;

describe('CatalogCategoryList', () => {
  it('renders every category as a link to getHref(id) with its name and count', () => {
    const href = vi.fn(getHref);
    render(<CatalogCategoryList categories={categories} value={null} getHref={href} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    for (const category of categories) {
      expect(href).toHaveBeenCalledWith(category.id);
      const link = screen.getByRole('link', { name: new RegExp(category.name) });
      expect(link).toHaveAttribute('href', getHref(category.id));
      expect(within(link).getByText(category.name)).toBeInTheDocument();
      expect(within(link).getByText(String(category.count))).toBeInTheDocument();
    }
  });

  it('names each link with the name, a single space and the count', () => {
    render(<CatalogCategoryList categories={categories} value="c1" getHref={getHref} />);

    expect(screen.getByRole('link', { name: 'Куртки 12' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Джинсы 0' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Платья 5' })).toBeInTheDocument();
  });

  it('shows a zero count as "0"', () => {
    render(<CatalogCategoryList categories={categories} value={null} getHref={getHref} />);

    expect(within(screen.getByRole('link', { name: /Джинсы/ })).getByText('0')).toBeInTheDocument();
  });

  it('marks only the chosen row with aria-current="page" and keeps it a link', () => {
    render(<CatalogCategoryList categories={categories} value="c3" getHref={getHref} />);

    const chosen = screen.getByRole('link', { name: /Платья/ });
    expect(chosen).toHaveAttribute('aria-current', 'page');
    expect(chosen).toHaveAttribute('href', getHref('c3'));
    expect(screen.getByRole('link', { name: /Куртки/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Джинсы/ })).not.toHaveAttribute('aria-current');
  });

  it('marks nothing when value is null', () => {
    render(<CatalogCategoryList categories={categories} value={null} getHref={getHref} />);

    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current');
    }
  });

  it('marks nothing when value matches no category', () => {
    render(<CatalogCategoryList categories={categories} value="unknown" getHref={getHref} />);

    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current');
    }
  });

  it('sits in a navigation landmark named "Категории" by default', () => {
    render(<CatalogCategoryList categories={categories} value={null} getHref={getHref} />);

    expect(screen.getByRole('navigation', { name: 'Категории' })).toBeInTheDocument();
  });

  it('takes the landmark name from aria-label and the class on the nav', () => {
    render(
      <CatalogCategoryList
        categories={categories}
        value={null}
        getHref={getHref}
        aria-label="Разделы"
        className="extra"
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Разделы' });
    expect(nav).toHaveClass('extra');
    expect(screen.queryByRole('navigation', { name: 'Категории' })).not.toBeInTheDocument();
  });

  describe('layout "rows"', () => {
    it('shows the count after the name, links kept', () => {
      render(
        <CatalogCategoryList
          categories={categories}
          value={null}
          getHref={getHref}
          layout="rows"
        />,
      );
      const link = screen.getByRole('link', { name: 'Куртки 12' });
      expect(link).toHaveAttribute('href', getHref('c1'));
      expect(within(link).getByText('12')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Джинсы 0' })).toBeInTheDocument();
    });

    it('marks only the chosen row with aria-current="page"', () => {
      render(
        <CatalogCategoryList categories={categories} value="c3" getHref={getHref} layout="rows" />,
      );
      expect(screen.getByRole('link', { name: 'Платья 5' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('link', { name: 'Куртки 12' })).not.toHaveAttribute('aria-current');
    });
  });

  describe('the «Все товары» row', () => {
    const all = { href: '/catalog?q=x', count: 17 };

    it.each(['column', 'rows'] as const)('comes first with its count and link in %s', (layout) => {
      render(
        <CatalogCategoryList
          categories={categories}
          value="c1"
          getHref={getHref}
          all={all}
          layout={layout}
        />,
      );
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(4);
      expect(links[0]).toHaveAccessibleName('Все товары 17');
      expect(links[0]).toHaveAttribute('href', '/catalog?q=x');
      expect(links[1]).toHaveAccessibleName('Куртки 12');
    });

    it('is the chosen one while no category is', () => {
      render(
        <CatalogCategoryList
          categories={categories}
          value={null}
          getHref={getHref}
          all={all}
          layout="rows"
        />,
      );
      expect(screen.getByRole('link', { name: 'Все товары 17' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('link', { name: 'Куртки 12' })).not.toHaveAttribute('aria-current');
    });

    it('is not current when a category is chosen', () => {
      render(
        <CatalogCategoryList
          categories={categories}
          value="c2"
          getHref={getHref}
          all={all}
          layout="rows"
        />,
      );
      expect(screen.getByRole('link', { name: 'Все товары 17' })).not.toHaveAttribute(
        'aria-current',
      );
      expect(screen.getByRole('link', { name: 'Джинсы 0' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('is absent without the prop', () => {
      render(<CatalogCategoryList categories={categories} value={null} getHref={getHref} />);
      expect(screen.queryByRole('link', { name: /Все товары/ })).not.toBeInTheDocument();
    });

    it('renders nothing for an empty list even with the row', () => {
      const { container } = render(
        <CatalogCategoryList categories={[]} value={null} getHref={getHref} all={all} />,
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(
      <CatalogCategoryList categories={[]} value={null} getHref={getHref} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
