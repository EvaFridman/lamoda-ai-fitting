import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

describe('icons section', () => {
  it('is in the sections list', () => {
    expect(sections.map(({ id, title }) => [id, title])).toContainEqual(['icons', 'Иконки']);
  });

  it('shows 35 icons, each with a name and one 16px and one 24px drawing', () => {
    render(<UiKitPage />);

    const region = screen.getByRole('region', { name: 'Иконки' });
    const items = within(region).getAllByRole('listitem');

    expect(items).toHaveLength(35);
    const names = items.map((item) => item.querySelector('code')?.textContent);
    expect(new Set(names).size).toBe(35);
    expect(names).toContain('BagIcon');
    expect(names).toContain('ProfileIcon');
    for (const name of [
      'HangerIcon',
      'SparkleIcon',
      'CameraIcon',
      'UploadIcon',
      'DownloadIcon',
      'FullscreenIcon',
      'RefreshIcon',
      'LockIcon',
      'CompareIcon',
      'FilterIcon',
      'ChevronLeftIcon',
      'ChevronRightIcon',
      'TrashIcon',
      'MoreIcon',
      'MenuIcon',
    ]) {
      expect(names).toContain(name);
    }
    for (const item of items) {
      expect(item.querySelector('code')?.textContent).toMatch(/^\w+Icon$/);
      const svgs = [...item.querySelectorAll('svg')];
      expect(svgs.map((svg) => svg.getAttribute('width')).sort()).toEqual(['16', '24']);
    }
  });
});
