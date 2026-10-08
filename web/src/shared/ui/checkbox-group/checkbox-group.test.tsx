import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox, CheckboxGroup } from '@/shared/ui';

describe('CheckboxGroup', () => {
  it('is a group named by aria-label', () => {
    render(
      <CheckboxGroup aria-label="Материал">
        <Checkbox value="cotton">Хлопок</Checkbox>
      </CheckboxGroup>,
    );

    expect(screen.getByRole('group', { name: 'Материал' })).toBeInTheDocument();
  });

  it('is a group named by a visible heading through aria-labelledby', () => {
    render(
      <>
        <p id="heading">Состав</p>
        <CheckboxGroup aria-labelledby="heading">
          <Checkbox value="cotton">Хлопок</Checkbox>
        </CheckboxGroup>
      </>,
    );

    expect(screen.getByRole('group', { name: 'Состав' })).toBeInTheDocument();
  });

  it('ticks the checkboxes listed in defaultValue', () => {
    render(
      <CheckboxGroup aria-label="Материал" defaultValue={['wool']}>
        <Checkbox value="cotton">Хлопок</Checkbox>
        <Checkbox value="wool">Шерсть</Checkbox>
      </CheckboxGroup>,
    );

    expect(screen.getByRole('checkbox', { name: 'Хлопок' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Шерсть' })).toBeChecked();
  });

  it('passes the array of ticked values to onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <CheckboxGroup aria-label="Материал" defaultValue={['wool']} onValueChange={onValueChange}>
        <Checkbox value="cotton">Хлопок</Checkbox>
        <Checkbox value="wool">Шерсть</Checkbox>
      </CheckboxGroup>,
    );

    await user.click(screen.getByText('Хлопок'));
    expect(onValueChange.mock.calls.at(-1)?.[0]).toEqual(['wool', 'cotton']);

    await user.click(screen.getByRole('checkbox', { name: 'Шерсть' }));
    expect(onValueChange.mock.calls.at(-1)?.[0]).toEqual(['cotton']);
  });

  it('moves Tab from box to box and Space ticks the focused one', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <CheckboxGroup aria-label="Материал" onValueChange={onValueChange}>
        <Checkbox value="cotton">Хлопок</Checkbox>
        <Checkbox value="wool">Шерсть</Checkbox>
      </CheckboxGroup>,
    );

    await user.tab();
    expect(screen.getByRole('checkbox', { name: 'Хлопок' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('checkbox', { name: 'Шерсть' })).toHaveFocus();

    await user.keyboard(' ');
    expect(onValueChange.mock.calls.at(-1)?.[0]).toEqual(['wool']);
  });

  it('does not tick a disabled item', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <CheckboxGroup aria-label="Материал" onValueChange={onValueChange}>
        <Checkbox value="linen" disabled>
          Лён
        </Checkbox>
      </CheckboxGroup>,
    );

    await user.click(screen.getByText('Лён'));

    expect(screen.getByRole('checkbox', { name: 'Лён' })).not.toBeChecked();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('follows the value prop when controlled', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <CheckboxGroup aria-label="Материал" value={['wool']} onValueChange={onValueChange}>
        <Checkbox value="cotton">Хлопок</Checkbox>
        <Checkbox value="wool">Шерсть</Checkbox>
      </CheckboxGroup>,
    );

    await user.click(screen.getByText('Хлопок'));

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: 'Хлопок' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Шерсть' })).toBeChecked();
  });
});
