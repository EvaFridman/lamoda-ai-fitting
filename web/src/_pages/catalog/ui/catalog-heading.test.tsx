import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CatalogHeading } from './catalog-heading';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/catalog/dresses',
}));

describe('CatalogHeading', () => {
  it('is the level 1 heading with the count after the title', () => {
    render(<CatalogHeading title="Платья" total={128} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Платья 128 товаров');
  });

  it('groups the digits of a long count with a no-break space', () => {
    render(<CatalogHeading title="Платья" total={50030} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      `50${String.fromCodePoint(0xa0)}030 товаров`,
    );
  });

  it('has no count until the counts load', () => {
    render(<CatalogHeading title="Платья" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Платья$/);
  });

  it('draws a hidden placeholder of the count while it is pending, with no count text', () => {
    render(<CatalogHeading title="Платья" countPending />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/^Платья$/);
    expect(heading.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('draws no placeholder without the pending flag', () => {
    render(<CatalogHeading title="Платья" />);
    expect(
      screen.getByRole('heading', { level: 1 }).querySelector('[aria-hidden="true"]'),
    ).not.toBeInTheDocument();
  });

  it('shows the count instead of the placeholder once the total is known', () => {
    render(<CatalogHeading title="Платья" total={128} countPending />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Платья 128 товаров');
    expect(heading.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it('can be focused by a script but is not in the tab order', () => {
    render(<CatalogHeading title="Платья" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAttribute('tabindex', '-1');
    heading.focus();
    expect(heading).toHaveFocus();
  });

  describe('the arrow', () => {
    it('comes before the heading in the row', async () => {
      render(<CatalogHeading title="Платья" total={128} />);
      const arrow = await screen.findByRole('link', { name: 'Назад' });
      const heading = screen.getByRole('heading', { level: 1 });
      expect(
        arrow.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('is not part of the heading, whose text stays the title and the count', async () => {
      render(<CatalogHeading title="Платья" total={128} />);
      await screen.findByRole('link', { name: 'Назад' });
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveAccessibleName('Платья 128 товаров');
      expect(heading).not.toContainElement(screen.getByRole('link', { name: 'Назад' }));
    });

    it('is left out with back={false}: no link or button, the heading stays', () => {
      render(<CatalogHeading title="Платья" back={false} />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Платья');
    });
  });
});
