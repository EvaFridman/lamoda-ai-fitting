import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CatalogCategoryList } from './catalog-category-list';

describe('CatalogCategoryList linkEvents', () => {
  it('keeps the href and prevents nothing before the handler runs', () => {
    const seen: boolean[] = [];
    const linkEvents = {
      onClick: vi.fn((event: { defaultPrevented: boolean }) => seen.push(event.defaultPrevented)),
      onPointerEnter: vi.fn(),
      onPointerLeave: vi.fn(),
    };
    render(
      <CatalogCategoryList
        categories={[{ id: 'c1', name: 'Куртки', count: 12 }]}
        value={null}
        getHref={(id) => `/catalog?category=${id}`}
        linkEvents={linkEvents}
      />,
    );
    const link = screen.getByRole('link', { name: 'Куртки 12' });
    // jsdom does not navigate; on the document, so it runs after React's handlers.
    const stop = (event: Event) => event.preventDefault();
    document.addEventListener('click', stop);

    expect(link).toHaveAttribute('href', '/catalog?category=c1');
    fireEvent.click(link);
    fireEvent.pointerEnter(link);
    document.removeEventListener('click', stop);

    expect(seen).toEqual([false]);
    expect(linkEvents.onPointerEnter).toHaveBeenCalledTimes(1);
  });
});
