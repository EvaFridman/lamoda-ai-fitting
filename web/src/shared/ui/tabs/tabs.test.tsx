import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
