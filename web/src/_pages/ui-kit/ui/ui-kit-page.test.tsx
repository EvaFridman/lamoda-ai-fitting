import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

describe('UiKitPage', () => {
  it('lists every section in the table of contents, once, with a link to its id', () => {
    render(<UiKitPage />);

    const toc = screen.getByRole('navigation', { name: 'Содержание' });
    const links = within(toc).getAllByRole('link');

    expect(links).toHaveLength(sections.length);
    for (const { id, title } of sections) {
      const matching = within(toc).getAllByRole('link', { name: title });
      expect(matching).toHaveLength(1);
      expect(matching[0]).toHaveAttribute('href', `#${id}`);
    }
  });

  it('renders a section with the entry id, labelled by its title heading, for every entry', () => {
    render(<UiKitPage />);

    expect(screen.getAllByRole('region')).toHaveLength(sections.length);
    for (const { id, title } of sections) {
      const region = screen.getByRole('region', { name: title });
      expect(region).toHaveAttribute('id', id);
      expect(within(region).getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
  });

  it('points every table-of-contents link at an existing section', () => {
    const { container } = render(<UiKitPage />);

    const toc = screen.getByRole('navigation', { name: 'Содержание' });
    for (const link of within(toc).getAllByRole('link')) {
      const id = link.getAttribute('href')?.slice(1) ?? '';
      expect(container.querySelector(`section[id="${id}"]`)).not.toBeNull();
    }
  });

  it('has the tokens section', () => {
    render(<UiKitPage />);

    expect(sections.map(({ id, title }) => [id, title])).toContainEqual(['tokens', 'Токены']);
    expect(screen.getByRole('heading', { level: 1, name: 'UI-kit' })).toBeInTheDocument();
  });
});
