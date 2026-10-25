import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

describe('scroll row section', () => {
  it('is in the sections list', () => {
    expect(sections.map(({ id, title }) => [id, title])).toContainEqual([
      'scroll-row',
      'Ряд с прокруткой',
    ]);
  });

  it('shows a row of 8 items and a row of 3', () => {
    render(<UiKitPage />);

    const region = screen.getByRole('region', { name: 'Ряд с прокруткой' });
    const first = within(region).getByRole('list', { name: 'Ряд, пример 1' });
    const second = within(region).getByRole('list', { name: 'Ряд, пример 2' });

    expect(within(first).getAllByRole('listitem')).toHaveLength(8);
    expect(within(second).getAllByRole('listitem')).toHaveLength(3);
  });
});
