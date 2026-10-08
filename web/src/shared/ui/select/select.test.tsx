import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select } from '@/shared/ui';

const options = [
  { value: 'xs', label: '40/42 RUS (XS)' },
  { value: 's', label: '42/44 RUS (S)' },
  { value: 'm', label: '44/46 RUS (M)', disabled: true },
  { value: 'l', label: '46/48 RUS (L)' },
];

function Sizes({ onValueChange }: { onValueChange?: (value: string | null) => void }) {
  return (
    <>
      <Select
        aria-label="Размер"
        options={options}
        placeholder="Выберите размер"
        onValueChange={onValueChange}
      />
      <button type="button">После</button>
    </>
  );
}

type User = ReturnType<typeof userEvent.setup>;

// Base UI ignores an open that comes soon after the popup of the previous test (the guard is on a
// clock it keeps between tests), so the opening is retried until the list is there.
async function open(user: User, how: 'click' | 'Enter' | 'Space', name = 'Размер') {
  const trigger = screen.getByRole('combobox', { name });
  await vi.waitFor(async () => {
    if (trigger.getAttribute('aria-expanded') !== 'true') {
      if (how === 'click') await user.click(trigger);
      else {
        trigger.focus();
        await user.keyboard(how === 'Enter' ? '{Enter}' : ' ');
      }
    }
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
  // The keys go to the list only once the focus has moved into it.
  await vi.waitFor(() => expect(trigger).not.toHaveFocus());
  return trigger;
}

function highlighted() {
  return screen.getAllByRole('option').find((option) => option.hasAttribute('data-highlighted'))
    ?.textContent;
}

describe('Select', () => {
  it('is a collapsed combobox named by aria-label and shows the placeholder', () => {
    render(<Sizes />);

    const trigger = screen.getByRole('combobox', { name: 'Размер' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Выберите размер');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('is named by a visible heading through aria-labelledby', () => {
    render(
      <>
        <p id="heading">Выбор размера</p>
        <Select aria-labelledby="heading" options={options} />
      </>,
    );

    expect(screen.getByRole('combobox', { name: 'Выбор размера' })).toBeInTheDocument();
  });

  it('shows the label of the default value instead of the placeholder', () => {
    render(
      <Select aria-label="Размер" options={options} defaultValue="s" placeholder="Выберите" />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Размер' });
    expect(trigger).toHaveTextContent('42/44 RUS (S)');
    expect(trigger).not.toHaveTextContent('Выберите');
  });

  it('is reached by Tab and opened by Enter', async () => {
    const user = userEvent.setup();
    render(<Sizes />);

    await user.tab();
    expect(screen.getByRole('combobox', { name: 'Размер' })).toHaveFocus();

    const trigger = await open(user, 'Enter');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('opens with Space', async () => {
    const user = userEvent.setup();
    render(<Sizes />);

    await open(user, 'Space');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('opens with a click', async () => {
    const user = userEvent.setup();
    render(<Sizes />);

    await open(user, 'click');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('moves the highlight with the arrows, picks with Enter, closes and returns focus', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Sizes onValueChange={onValueChange} />);

    const trigger = await open(user, 'Enter');
    expect(highlighted()).toBe('40/42 RUS (XS)');
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toBe('42/44 RUS (S)');
    await user.keyboard('{Enter}');

    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe('s');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveTextContent('42/44 RUS (S)');
    expect(trigger).not.toHaveTextContent('Выберите размер');
  });

  it('does not pick a disabled option with Enter and still picks the next one', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Sizes onValueChange={onValueChange} />);

    await open(user, 'Enter');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onValueChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0]?.[0]).toBe('l');
  });

  it('does not pick a disabled option on a click', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Sizes onValueChange={onValueChange} />);

    const trigger = await open(user, 'click');
    const disabled = screen.getByRole('option', { name: '44/46 RUS (M)' });
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await user.click(disabled);

    expect(onValueChange).not.toHaveBeenCalled();
    expect(trigger).toHaveTextContent('Выберите размер');
  });

  it('picks an option on a click and marks it selected', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Sizes onValueChange={onValueChange} />);

    await open(user, 'click');
    await user.click(screen.getByRole('option', { name: '46/48 RUS (L)' }));

    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe('l');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await open(user, 'Enter');
    expect(screen.getByRole('option', { name: '46/48 RUS (L)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: '40/42 RUS (XS)' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('closes on Esc without a change and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Sizes onValueChange={onValueChange} />);

    const trigger = await open(user, 'Enter');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveTextContent('Выберите размер');
  });

  it('shows thumbnails as decorative images in the field and the list', async () => {
    const user = userEvent.setup();
    render(
      <Select
        aria-label="Цвет"
        defaultValue="white"
        options={[
          { value: 'white', label: 'Белый', thumbnail: '/media/seed/products/BRS-TS-001/1.webp' },
          { value: 'black', label: 'Черный', thumbnail: '/media/seed/products/BRS-TS-002/1.webp' },
        ]}
      />,
    );

    const trigger = await open(user, 'Enter', 'Цвет');

    expect(trigger.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: 'Белый' })).toBeInTheDocument();
    for (const image of document.querySelectorAll('img')) expect(image).toHaveAttribute('alt', '');
  });

  it('does not open when disabled and leaves the Tab order', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Select aria-label="Размер" options={options} disabled />
        <button type="button">После</button>
      </>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Размер' }));
    expect(screen.getByRole('combobox', { name: 'Размер' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'После' })).toHaveFocus();
  });

  it('starts open with defaultOpen', () => {
    render(<Select aria-label="Размер" options={options} defaultOpen />);

    expect(screen.getByRole('combobox', { name: 'Размер' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});
