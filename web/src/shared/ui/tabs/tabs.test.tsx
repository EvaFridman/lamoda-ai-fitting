import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Tabs } from '@/shared/ui';

const items = [
  { value: 'about', label: 'О товаре', panel: <p>Про товар</p> },
  { value: 'brand', label: 'О бренде', panel: <p>Про бренд</p> },
  { value: 'reviews', label: 'Отзывы', count: 54, panel: <p>Про отзывы</p> },
];

const withDisabledMiddle = items.map((item) =>
  item.value === 'brand' ? { ...item, disabled: true } : item,
);

describe('Tabs', () => {
  it('is a tab list named by aria-label with a tab per item', () => {
    render(<Tabs aria-label="О товаре" items={items} />);

    expect(screen.getByRole('tablist', { name: 'О товаре' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('selects the first tab by default and shows its panel only', () => {
    render(<Tabs items={items} />);

    expect(screen.getByRole('tab', { name: 'О товаре' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'О бренде' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Про товар');
    expect(screen.queryByText('Про бренд')).toBeNull();
  });

  it('renders no tabpanel for items without a panel, and the tabs still switch', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const bare = [
      { value: 'list', label: 'Список' },
      { value: 'map', label: 'Карта' },
    ];
    render(<Tabs items={bare} value="list" onValueChange={onValueChange} />);

    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Список' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Карта' }));

    expect(onValueChange).toHaveBeenCalledWith('map');
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('selects the first enabled tab by default when the first item is disabled', () => {
    const firstDisabled = items.map((item) =>
      item.value === 'about' ? { ...item, disabled: true } : item,
    );
    render(<Tabs items={firstDisabled} />);

    expect(screen.getByRole('tab', { name: 'О товаре' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'О бренде' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Про бренд');
    expect(screen.queryByText('Про товар')).toBeNull();
  });

  it('opens the tab named by defaultValue', () => {
    render(<Tabs items={items} defaultValue="reviews" />);

    expect(screen.getByRole('tab', { name: 'Отзывы 54' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Про отзывы');
  });

  it('writes the count after the label', () => {
    render(<Tabs items={items} />);

    expect(screen.getByRole('tab', { name: 'Отзывы 54' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'О товаре' })).toBeInTheDocument();
  });

  // AC4
  it('switches the panel on click', async () => {
    const user = userEvent.setup();
    render(<Tabs items={items} />);

    await user.click(screen.getByRole('tab', { name: 'О бренде' }));

    expect(screen.getByRole('tab', { name: 'О бренде' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Про бренд');
    expect(screen.queryByText('Про товар')).toBeNull();
  });

  it('calls onValueChange with the value of the tab picked', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Tabs items={items} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('tab', { name: 'Отзывы 54' }));

    expect(onValueChange).toHaveBeenCalledWith('reviews');
  });

  it('follows the controlled value and only reports the click', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Tabs items={items} value="brand" onValueChange={onValueChange} />);

    expect(screen.getByRole('tabpanel')).toHaveTextContent('Про бренд');
    await user.click(screen.getByRole('tab', { name: 'Отзывы 54' }));

    expect(onValueChange).toHaveBeenCalledWith('reviews');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Про бренд');
  });

  describe('keyboard', () => {
    // AC8
    it('focuses the selected tab with Tab, then the panel with the next Tab', async () => {
      const user = userEvent.setup();
      render(<Tabs items={items} defaultValue="brand" />);

      await user.tab();
      expect(screen.getByRole('tab', { name: 'О бренде' })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('tabpanel')).toHaveFocus();
    });

    // AC8
    it('moves with the arrows and shows the panel at once', async () => {
      const user = userEvent.setup();
      render(<Tabs items={items} />);
      await user.tab();

      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'О бренде' })).toHaveFocus();
      expect(screen.getByRole('tab', { name: 'О бренде' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Про бренд');

      await user.keyboard('{ArrowLeft}');
      expect(screen.getByRole('tab', { name: 'О товаре' })).toHaveFocus();
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Про товар');
    });

    it('goes to the last and the first tab with End and Home', async () => {
      const user = userEvent.setup();
      render(<Tabs items={items} />);
      await user.tab();

      await user.keyboard('{End}');
      expect(screen.getByRole('tab', { name: 'Отзывы 54' })).toHaveFocus();
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Про отзывы');

      await user.keyboard('{Home}');
      expect(screen.getByRole('tab', { name: 'О товаре' })).toHaveFocus();
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Про товар');
    });

    it('loops from the last tab to the first and back', async () => {
      const user = userEvent.setup();
      render(<Tabs items={items} defaultValue="reviews" />);
      await user.tab();

      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'О товаре' })).toHaveFocus();
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Про товар');

      await user.keyboard('{ArrowLeft}');
      expect(screen.getByRole('tab', { name: 'Отзывы 54' })).toHaveFocus();
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Про отзывы');
    });
  });

  // AC4
  describe('the sliding underline', () => {
    // jsdom has no layout: each tab gets a box by its text, as the browser would measure it.
    const boxes: Record<string, { left: number; width: number }> = {
      'О товаре': { left: 0, width: 80 },
      'О бренде': { left: 80, width: 90 },
      'Отзывы 54': { left: 170, width: 100 },
    };
    const height = 40;
    const boxOf = (el: HTMLElement) =>
      el.getAttribute('role') === 'tablist'
        ? { left: 0, width: 300 }
        : (boxes[el.textContent ?? ''] ?? { left: 0, width: 0 });
    const restore: Array<() => void> = [];

    function stub(
      name: 'offsetLeft' | 'offsetWidth' | 'offsetHeight',
      value: (el: HTMLElement) => number,
    ) {
      const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
      Object.defineProperty(HTMLElement.prototype, name, {
        configurable: true,
        get(this: HTMLElement) {
          return value(this);
        },
      });
      restore.push(() => {
        if (original) Object.defineProperty(HTMLElement.prototype, name, original);
      });
    }

    beforeEach(() => {
      stub('offsetLeft', (el) => boxOf(el).left);
      stub('offsetWidth', (el) => boxOf(el).width);
      stub('offsetHeight', () => height);
      const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
      rect.mockImplementation(function (this: HTMLElement) {
        const { left, width } = boxOf(this);
        return {
          left,
          right: left + width,
          top: 0,
          bottom: height,
          width,
          height,
          x: left,
          y: 0,
          toJSON: () => ({}),
        };
      });
      restore.push(() => rect.mockRestore());
    });

    afterEach(() => {
      restore.splice(0).forEach((undo) => undo());
    });

    const indicatorOf = (container: HTMLElement) =>
      container.querySelectorAll<HTMLElement>('[role="tablist"] > [role="presentation"]');

    const onlyIndicator = (container: HTMLElement) => {
      const found = indicatorOf(container);
      if (found.length !== 1 || !found[0]) throw new Error('expected one indicator');
      return found[0];
    };

    it('renders one indicator inside the tab list, which is not a tab', () => {
      const { container } = render(<Tabs items={items} />);

      expect(indicatorOf(container)).toHaveLength(1);
      expect(screen.getAllByRole('tab')).toHaveLength(3);
      expect(screen.queryByRole('tab', { name: '' })).toBeNull();
    });

    it('starts under the selected tab', () => {
      const { container } = render(<Tabs items={items} defaultValue="brand" />);
      const indicator = onlyIndicator(container);

      expect(indicator.style.getPropertyValue('--active-tab-left')).toBe('80px');
      expect(indicator.style.getPropertyValue('--active-tab-width')).toBe('90px');
    });

    it('follows a click (uncontrolled)', async () => {
      const user = userEvent.setup();
      const { container } = render(<Tabs items={items} />);
      const indicator = onlyIndicator(container);
      expect(indicator.style.getPropertyValue('--active-tab-left')).toBe('0px');
      expect(indicator.style.getPropertyValue('--active-tab-width')).toBe('80px');

      await user.click(screen.getByRole('tab', { name: 'Отзывы 54' }));

      expect(indicatorOf(container)[0]).toBe(indicator);
      expect(indicator.style.getPropertyValue('--active-tab-left')).toBe('170px');
      expect(indicator.style.getPropertyValue('--active-tab-width')).toBe('100px');
    });

    it('follows the arrow keys', async () => {
      const user = userEvent.setup();
      const { container } = render(<Tabs items={items} />);
      const indicator = onlyIndicator(container);
      await user.tab();

      await user.keyboard('{ArrowRight}');
      expect(indicator.style.getPropertyValue('--active-tab-left')).toBe('80px');
      expect(indicator.style.getPropertyValue('--active-tab-width')).toBe('90px');

      await user.keyboard('{ArrowLeft}');
      expect(indicator.style.getPropertyValue('--active-tab-left')).toBe('0px');
      expect(indicator.style.getPropertyValue('--active-tab-width')).toBe('80px');
    });

    it('follows the controlled value, not the click', async () => {
      const user = userEvent.setup();
      const { container, rerender } = render(
        <Tabs items={items} value="about" onValueChange={vi.fn()} />,
      );
      const indicator = onlyIndicator(container);

      await user.click(screen.getByRole('tab', { name: 'О бренде' }));
      expect(indicator.style.getPropertyValue('--active-tab-left')).toBe('0px');

      rerender(<Tabs items={items} value="brand" onValueChange={vi.fn()} />);
      expect(indicator.style.getPropertyValue('--active-tab-left')).toBe('80px');
      expect(indicator.style.getPropertyValue('--active-tab-width')).toBe('90px');
    });
  });

  describe('a disabled tab', () => {
    it('is disabled and never selected by a click', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<Tabs items={withDisabledMiddle} onValueChange={onValueChange} />);
      const brand = screen.getByRole('tab', { name: 'О бренде' });

      await user.click(brand);

      expect(brand).toHaveAttribute('aria-disabled', 'true');
      expect(brand).toHaveAttribute('aria-selected', 'false');
      expect(onValueChange).not.toHaveBeenCalled();
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Про товар');
    });

    it('is never selected by the arrows, and its panel never shows', async () => {
      const user = userEvent.setup();
      render(<Tabs items={withDisabledMiddle} />);
      const brand = screen.getByRole('tab', { name: 'О бренде' });
      await user.tab();

      await user.keyboard('{ArrowRight}');
      expect(brand).toHaveAttribute('aria-selected', 'false');
      expect(screen.queryByText('Про бренд')).toBeNull();

      await user.keyboard('{ArrowRight}');
      expect(brand).toHaveAttribute('aria-selected', 'false');
      expect(screen.queryByText('Про бренд')).toBeNull();
      expect(screen.getByRole('tab', { name: 'Отзывы 54' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  });
});
