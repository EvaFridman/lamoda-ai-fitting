import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Accordion } from '@/shared/ui';

const items = [
  { value: 'composition', title: 'Состав', content: <p>Акрил</p> },
  { value: 'delivery', title: 'Доставка', content: <p>Курьером</p> },
  { value: 'returns', title: 'Возврат', content: <p>14 дней</p> },
];

const trigger = (name: string) => screen.getByRole('button', { name });

describe('Accordion', () => {
  it('gives each title as an h3 holding a closed button', () => {
    render(<Accordion items={items} />);

    for (const { title } of items) {
      const heading = screen.getByRole('heading', { level: 3, name: title });
      expect(heading).toContainElement(trigger(title));
      expect(trigger(title)).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('opens a row with defaultValue', () => {
    render(<Accordion items={items} defaultValue={['delivery']} />);

    expect(trigger('Доставка')).toHaveAttribute('aria-expanded', 'true');
    expect(trigger('Состав')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('region', { name: 'Доставка' })).toHaveTextContent('Курьером');
  });

  // AC8
  it('opens and closes a focused row with Enter', async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);

    await user.tab();
    expect(trigger('Состав')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(trigger('Состав')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Состав' })).toHaveTextContent('Акрил');

    await user.keyboard('{Enter}');
    expect(trigger('Состав')).toHaveAttribute('aria-expanded', 'false');
  });

  // AC8
  it('opens and closes a focused row with Space', async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);

    await user.tab();
    await user.keyboard(' ');
    expect(trigger('Состав')).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard(' ');
    expect(trigger('Состав')).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves between rows with Tab', async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);

    await user.tab();
    await user.tab();
    expect(trigger('Доставка')).toHaveFocus();
    await user.tab();
    expect(trigger('Возврат')).toHaveFocus();
  });

  it('keeps one row open at a time by default', async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);

    await user.click(trigger('Состав'));
    await user.click(trigger('Доставка'));

    expect(trigger('Состав')).toHaveAttribute('aria-expanded', 'false');
    expect(trigger('Доставка')).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps several rows open with multiple', async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} multiple />);

    await user.click(trigger('Состав'));
    await user.click(trigger('Доставка'));

    expect(trigger('Состав')).toHaveAttribute('aria-expanded', 'true');
    expect(trigger('Доставка')).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not open a disabled row', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Accordion
        items={items.map((item) => (item.value === 'returns' ? { ...item, disabled: true } : item))}
        onValueChange={onValueChange}
      />,
    );

    await user.click(trigger('Возврат'));

    expect(trigger('Возврат')).toHaveAttribute('aria-disabled', 'true');
    expect(trigger('Возврат')).toHaveAttribute('aria-expanded', 'false');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('reports the open values as an array', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Accordion items={items} multiple onValueChange={onValueChange} />);

    await user.click(trigger('Состав'));
    expect(onValueChange).toHaveBeenLastCalledWith(['composition']);
    await user.click(trigger('Доставка'));
    expect(onValueChange).toHaveBeenLastCalledWith(['composition', 'delivery']);
    await user.click(trigger('Состав'));
    expect(onValueChange).toHaveBeenLastCalledWith(['delivery']);
  });

  it('follows the controlled value and only reports the click', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Accordion items={items} value={['composition']} onValueChange={onValueChange} />);

    await user.click(trigger('Доставка'));

    expect(onValueChange).toHaveBeenLastCalledWith(['delivery']);
    expect(trigger('Состав')).toHaveAttribute('aria-expanded', 'true');
    expect(trigger('Доставка')).toHaveAttribute('aria-expanded', 'false');
  });
});
