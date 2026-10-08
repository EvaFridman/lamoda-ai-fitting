import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Radio, RadioGroup } from '@/shared/ui';

function Sorts({ onValueChange }: { onValueChange?: (value: string) => void }) {
  return (
    <RadioGroup aria-label="Сортировка" defaultValue="new" onValueChange={onValueChange}>
      <Radio value="popular">Подобрали для вас</Radio>
      <Radio value="new">Новинки</Radio>
      <Radio value="cheap">Сначала дешевле</Radio>
    </RadioGroup>
  );
}

describe('RadioGroup', () => {
  it('is a radiogroup named by aria-label with radios named by their labels', () => {
    render(<Sorts />);

    const group = screen.getByRole('radiogroup', { name: 'Сортировка' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Новинки' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Новинки' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Подобрали для вас' })).not.toBeChecked();
  });

  it('is named by a visible heading through aria-labelledby', () => {
    render(
      <>
        <p id="heading">Порядок</p>
        <RadioGroup aria-labelledby="heading">
          <Radio value="a">А</Radio>
        </RadioGroup>
      </>,
    );

    expect(screen.getByRole('radiogroup', { name: 'Порядок' })).toBeInTheDocument();
  });

  it('puts Tab on the checked radio and leaves the group on the next Tab', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Sorts />
        <button type="button">После</button>
      </>,
    );

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Новинки' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'После' })).toHaveFocus();
  });

  it('moves and selects with ArrowDown and ArrowUp', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Sorts onValueChange={onValueChange} />);

    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Сначала дешевле' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Сначала дешевле' })).toHaveFocus();
    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe('cheap');

    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('radio', { name: 'Подобрали для вас' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Новинки' })).not.toBeChecked();
  });

  it('moves and selects with ArrowRight and ArrowLeft', async () => {
    const user = userEvent.setup();
    render(<Sorts />);

    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Сначала дешевле' })).toBeChecked();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Новинки' })).toBeChecked();
  });

  it('selects a radio on a click of its label text', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Sorts onValueChange={onValueChange} />);

    await user.click(screen.getByText('Сначала дешевле'));

    expect(screen.getByRole('radio', { name: 'Сначала дешевле' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Новинки' })).not.toBeChecked();
    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe('cheap');
  });

  it('starts with nothing checked when there is no value', () => {
    render(
      <RadioGroup aria-label="Сортировка">
        <Radio value="a">А</Radio>
        <Radio value="b">Б</Radio>
      </RadioGroup>,
    );

    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });

  it('does not select a disabled radio', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <RadioGroup aria-label="Сортировка" onValueChange={onValueChange}>
        <Radio value="a" disabled>
          А
        </Radio>
      </RadioGroup>,
    );

    await user.click(screen.getByText('А'));

    expect(screen.getByRole('radio', { name: 'А' })).not.toBeChecked();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('follows the value prop when controlled', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <RadioGroup aria-label="Сортировка" value="a" onValueChange={onValueChange}>
        <Radio value="a">А</Radio>
        <Radio value="b">Б</Radio>
      </RadioGroup>,
    );

    await user.click(screen.getByText('Б'));

    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe('b');
    expect(screen.getByRole('radio', { name: 'А' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Б' })).not.toBeChecked();
  });
});

describe('RadioGroup, disabled radios and Tab', () => {
  it.each([
    ['unchecked', undefined],
    ['checked', 'a'],
  ])('skips a lone disabled radio (%s)', async (_state, defaultValue) => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">До</button>
        <RadioGroup aria-label="Сортировка" defaultValue={defaultValue}>
          <Radio value="a" disabled>
            А
          </Radio>
        </RadioGroup>
        <button type="button">После</button>
      </>,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'До' })).toHaveFocus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'После' })).toHaveFocus();
  });

  it('lands on the first enabled radio when the first one is disabled and none is checked', async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup aria-label="Сортировка">
        <Radio value="a" disabled>
          А
        </Radio>
        <Radio value="b">Б</Radio>
        <Radio value="c">В</Radio>
      </RadioGroup>,
    );

    await user.tab();

    expect(screen.getByRole('radio', { name: 'Б' })).toHaveFocus();
  });

  it('skips a disabled RadioGroup entirely', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">До</button>
        <RadioGroup aria-label="Сортировка" disabled defaultValue="a">
          <Radio value="a">А</Radio>
          <Radio value="b">Б</Radio>
        </RadioGroup>
        <button type="button">После</button>
      </>,
    );

    await user.tab();
    await user.tab();

    expect(screen.getByRole('button', { name: 'После' })).toHaveFocus();
  });

  it('reaches a group whose checked radio is disabled but others are enabled', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <>
        <button type="button">До</button>
        <RadioGroup aria-label="Сортировка" defaultValue="a" onValueChange={onValueChange}>
          <Radio value="a" disabled>
            А
          </Radio>
          <Radio value="b">Б</Radio>
          <Radio value="c">В</Radio>
        </RadioGroup>
        <button type="button">После</button>
      </>,
    );

    await user.tab();
    await user.tab();
    const radios = screen.getAllByRole('radio');
    expect(radios).toContain(document.activeElement);
    expect(screen.getByRole('button', { name: 'После' })).not.toHaveFocus();

    await user.keyboard('{ArrowDown}');

    expect(onValueChange).toHaveBeenCalled();
    const picked = onValueChange.mock.calls.at(-1)?.[0];
    expect(['b', 'c']).toContain(picked);
    expect(screen.getByRole('radio', { name: 'А' })).not.toBeChecked();
  });

  it('skips the group once its last enabled radio becomes disabled', async () => {
    const user = userEvent.setup();
    const ui = (bDisabled: boolean) => (
      <>
        <button type="button">До</button>
        <RadioGroup aria-label="Сортировка">
          <Radio value="a" disabled>
            А
          </Radio>
          <Radio value="b" disabled={bDisabled}>
            Б
          </Radio>
        </RadioGroup>
        <button type="button">После</button>
      </>
    );
    const { rerender } = render(ui(false));
    rerender(ui(true));

    await user.tab();
    await user.tab();

    expect(screen.getByRole('button', { name: 'После' })).toHaveFocus();
  });

  it('reaches the group once a radio becomes enabled again', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const ui = (bDisabled: boolean) => (
      <>
        <button type="button">До</button>
        <RadioGroup aria-label="Сортировка" onValueChange={onValueChange}>
          <Radio value="a" disabled>
            А
          </Radio>
          <Radio value="b" disabled={bDisabled}>
            Б
          </Radio>
        </RadioGroup>
        <button type="button">После</button>
      </>
    );
    const { rerender } = render(ui(true));
    rerender(ui(false));

    await user.tab();
    await user.tab();

    // Base UI re-validates the tab stop only when the item set changes, not when a disabled flag
    // flips, so focus may first land on the disabled radio A; the arrows then reach the enabled one.
    expect(screen.getAllByRole('radio')).toContain(document.activeElement);
    expect(screen.getByRole('button', { name: 'После' })).not.toHaveFocus();

    await user.keyboard('{ArrowDown}');

    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe('b');
    expect(screen.getByRole('radio', { name: 'Б' })).toBeChecked();
  });
});
