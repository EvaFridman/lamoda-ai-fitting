import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from '@/shared/ui';

describe('Checkbox', () => {
  it('is a checkbox named by its label, unchecked by default', () => {
    render(<Checkbox>Хлопок</Checkbox>);

    expect(screen.getByRole('checkbox', { name: 'Хлопок' })).not.toBeChecked();
  });

  it('starts checked with defaultChecked', () => {
    render(<Checkbox defaultChecked>Хлопок</Checkbox>);

    const box = screen.getByRole('checkbox', { name: 'Хлопок' });
    expect(box).toBeChecked();
    expect(box).toHaveAttribute('aria-checked', 'true');
  });

  it('is reached by Tab and toggled by Space', async () => {
    const user = userEvent.setup();
    render(<Checkbox>Хлопок</Checkbox>);
    const box = screen.getByRole('checkbox', { name: 'Хлопок' });

    await user.tab();
    expect(box).toHaveFocus();

    await user.keyboard(' ');
    expect(box).toBeChecked();
    await user.keyboard(' ');
    expect(box).not.toBeChecked();
  });

  it('toggles on a click of the label text', async () => {
    const user = userEvent.setup();
    render(<Checkbox>Хлопок</Checkbox>);

    await user.click(screen.getByText('Хлопок'));

    expect(screen.getByRole('checkbox', { name: 'Хлопок' })).toBeChecked();
  });

  it('reports the new state to onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={onCheckedChange}>Хлопок</Checkbox>);

    await user.click(screen.getByRole('checkbox', { name: 'Хлопок' }));

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
  });

  it('follows the checked prop when controlled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Checkbox checked={false} onCheckedChange={onCheckedChange}>
        Хлопок
      </Checkbox>,
    );
    const box = screen.getByRole('checkbox', { name: 'Хлопок' });

    await user.click(box);
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(box).not.toBeChecked();

    rerender(
      <Checkbox checked onCheckedChange={onCheckedChange}>
        Хлопок
      </Checkbox>,
    );
    expect(box).toBeChecked();
  });

  it('does not toggle when disabled, by Space or by a label click', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Checkbox disabled onCheckedChange={onCheckedChange}>
        Хлопок
      </Checkbox>,
    );
    const box = screen.getByRole('checkbox', { name: 'Хлопок' });

    await user.click(screen.getByText('Хлопок'));
    await user.tab();
    await user.keyboard(' ');

    expect(box).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('keeps a disabled checked box checked', () => {
    render(
      <Checkbox disabled defaultChecked>
        Хлопок
      </Checkbox>,
    );

    expect(screen.getByRole('checkbox', { name: 'Хлопок' })).toBeChecked();
  });
});
