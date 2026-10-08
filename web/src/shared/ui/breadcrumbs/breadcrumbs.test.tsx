import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Breadcrumbs } from '@/shared/ui';

const items = [
  { label: 'Главная', href: '/' },
  { label: 'Женщинам', href: '/women' },
  { label: 'Кардиганы' },
];

describe('Breadcrumbs', () => {
  it('is a navigation named "Навигация по разделам" by default, or by aria-label', () => {
    const first = render(<Breadcrumbs items={items} />);
    expect(screen.getByRole('navigation', { name: 'Навигация по разделам' })).toBeInTheDocument();
    first.unmount();

    render(<Breadcrumbs items={items} aria-label="Путь" />);
    expect(screen.getByRole('navigation', { name: 'Путь' })).toBeInTheDocument();
  });

  it('is an ordered list with an item per crumb', () => {
    render(<Breadcrumbs items={items} />);

    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('links every crumb but the last', () => {
    render(<Breadcrumbs items={items} />);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Главная', '/'],
      ['Женщинам', '/women'],
    ]);
  });

  it('shows the last crumb as the current page, not as a link', () => {
    render(<Breadcrumbs items={items} />);

    const current = screen.getByText('Кардиганы');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Кардиганы' })).toBeNull();
    expect(screen.getByText('Главная')).not.toHaveAttribute('aria-current');
  });

  it('puts a hidden "/" after every crumb but the last', () => {
    render(<Breadcrumbs items={items} />);

    const separators = screen.getAllByText('/', { ignore: 'a' });
    expect(separators).toHaveLength(2);
    for (const separator of separators) expect(separator).toHaveAttribute('aria-hidden', 'true');

    const lastItem = screen.getAllByRole('listitem')[2];
    expect(lastItem).not.toHaveTextContent('/');
  });

  it('shows a single crumb as the current page with no separator', () => {
    render(<Breadcrumbs items={[{ label: 'Главная' }]} />);

    expect(screen.getByText('Главная')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText('/')).toBeNull();
  });
});
