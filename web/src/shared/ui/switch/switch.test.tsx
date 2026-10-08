import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from '@/shared/ui';

describe('Switch', () => {
  it('is a switch named by its label, off by default', () => {
    render(<Switch>Только со скидкой</Switch>);

    const control = screen.getByRole('switch', { name: 'Только со скидкой' });
    expect(control).not.toBeChecked();
    expect(control).toHaveAttribute('aria-checked', 'false');
  });

  it('starts on with defaultChecked and exposes aria-checked', () => {
    render(<Switch defaultChecked>Только со скидкой</Switch>);

    const control = screen.getByRole('switch', { name: 'Только со скидкой' });
    expect(control).toBeChecked();
    expect(control).toHaveAttribute('aria-checked', 'true');
  });

  it('is reached by Tab and toggled by Space', async () => {
    const user = userEvent.setup();
    render(<Switch>Только со скидкой</Switch>);
    const control = screen.getByRole('switch', { name: 'Только со скидкой' });

    await user.tab();
    expect(control).toHaveFocus();

    await user.keyboard(' ');
    expect(control).toBeChecked();
    await user.keyboard(' ');
    expect(control).not.toBeChecked();
  });

  it('toggles on a click of the label text and reports the state', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch onCheckedChange={onCheckedChange}>Только со скидкой</Switch>);

    await user.click(screen.getByText('Только со скидкой'));

    expect(screen.getByRole('switch', { name: 'Только со скидкой' })).toBeChecked();
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
  });

  it('follows the checked prop when controlled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch checked={false} onCheckedChange={onCheckedChange}>
        Только со скидкой
      </Switch>,
    );
    const control = screen.getByRole('switch', { name: 'Только со скидкой' });

    await user.click(control);

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(control).not.toBeChecked();
  });

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch disabled onCheckedChange={onCheckedChange}>
        Только со скидкой
      </Switch>,
    );
    const control = screen.getByRole('switch', { name: 'Только со скидкой' });

    await user.click(screen.getByText('Только со скидкой'));
    await user.tab();
    await user.keyboard(' ');

    expect(control).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
