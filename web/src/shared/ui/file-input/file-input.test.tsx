import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileInput } from './file-input';

function nativeInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
  return input;
}

const png = () => new File(['x'], 'me.png', { type: 'image/png' });

describe('FileInput', () => {
  it('renders a button that is not a submit and a hidden native input', () => {
    const { container } = render(<FileInput onFileChange={vi.fn()}>Загрузить фото</FileInput>);
    expect(screen.getByRole('button', { name: 'Загрузить фото' })).toHaveAttribute(
      'type',
      'button',
    );
    const input = nativeInput(container);
    expect(input).toHaveAttribute('hidden');
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input).toHaveAttribute('aria-hidden', 'true');
  });

  it('passes accept and capture to the input', () => {
    const { container } = render(
      <FileInput accept="image/png" capture="user" onFileChange={vi.fn()}>
        Фото
      </FileInput>,
    );
    const input = nativeInput(container);
    expect(input).toHaveAttribute('accept', 'image/png');
    expect(input).toHaveAttribute('capture', 'user');
  });

  it('opens the picker when the button is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<FileInput onFileChange={vi.fn()}>Фото</FileInput>);
    const click = vi.spyOn(nativeInput(container), 'click');
    await user.click(screen.getByRole('button', { name: 'Фото' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('calls onFileChange with the chosen file', async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const { container } = render(<FileInput onFileChange={onFileChange}>Фото</FileInput>);
    const file = png();
    await user.upload(nativeInput(container), file);
    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange).toHaveBeenCalledWith(file);
  });

  it('empties the input, so choosing the same file again calls it again', async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const { container } = render(<FileInput onFileChange={onFileChange}>Фото</FileInput>);
    const input = nativeInput(container);
    const file = png();
    await user.upload(input, file);
    expect(input.value).toBe('');
    await user.upload(input, file);
    expect(onFileChange).toHaveBeenCalledTimes(2);
  });

  it('does not call onFileChange when no file is chosen', async () => {
    const onFileChange = vi.fn();
    const { container } = render(<FileInput onFileChange={onFileChange}>Фото</FileInput>);
    nativeInput(container).dispatchEvent(new Event('change', { bubbles: true }));
    expect(onFileChange).not.toHaveBeenCalled();
  });

  it('disables the button and the input when disabled', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FileInput disabled onFileChange={vi.fn()}>
        Фото
      </FileInput>,
    );
    const input = nativeInput(container);
    const click = vi.spyOn(input, 'click');
    const button = screen.getByRole('button', { name: 'Фото' });
    expect(button).toBeDisabled();
    expect(input).toBeDisabled();
    await user.click(button);
    expect(click).not.toHaveBeenCalled();
  });

  it('is busy while loading and disables the input', () => {
    const { container } = render(
      <FileInput loading onFileChange={vi.fn()}>
        Фото
      </FileInput>,
    );
    expect(screen.getByRole('button', { name: 'Фото' })).toHaveAttribute('aria-busy', 'true');
    expect(nativeInput(container)).toBeDisabled();
  });

  it('does not open the picker while loading', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FileInput loading onFileChange={vi.fn()}>
        Фото
      </FileInput>,
    );
    const click = vi.spyOn(nativeInput(container), 'click');
    await user.click(screen.getByRole('button', { name: 'Фото' }));
    expect(click).not.toHaveBeenCalled();
  });

  it.each([
    ['the kit button', false],
    ['the bare button', true],
  ])('names and describes %s through aria-label and aria-describedby', (_form, bare) => {
    render(
      <>
        <span id="hint">в полный рост</span>
        <FileInput
          bare={bare}
          aria-label="Добавить фото"
          aria-describedby="hint"
          onFileChange={vi.fn()}
        >
          Плюс
        </FileInput>
      </>,
    );

    const button = screen.getByRole('button', { name: 'Добавить фото' });
    expect(button).toHaveAccessibleDescription('в полный рост');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('bare is a plain button with the given class, opening the picker with the events', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <FileInput bare className="dashed" events={{ onClick }} onFileChange={vi.fn()}>
        Карточка
      </FileInput>,
    );
    const click = vi.spyOn(nativeInput(container), 'click');
    const button = screen.getByRole('button', { name: 'Карточка' });

    expect(button).toHaveClass('dashed');
    expect(button).not.toHaveClass('button');
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('bare calls onFileChange with the chosen file', async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const { container } = render(
      <FileInput bare onFileChange={onFileChange}>
        Карточка
      </FileInput>,
    );
    const file = png();

    await user.upload(nativeInput(container), file);

    expect(onFileChange).toHaveBeenCalledWith(file);
  });

  it('bare is disabled and busy while loading, and does not open the picker', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FileInput bare loading onFileChange={vi.fn()}>
        Карточка
      </FileInput>,
    );
    const click = vi.spyOn(nativeInput(container), 'click');
    const button = screen.getByRole('button', { name: 'Карточка' });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(nativeInput(container)).toBeDisabled();
    await user.click(button);
    expect(click).not.toHaveBeenCalled();
  });

  it('bare is disabled when disabled', () => {
    const { container } = render(
      <FileInput bare disabled onFileChange={vi.fn()}>
        Карточка
      </FileInput>,
    );

    expect(screen.getByRole('button', { name: 'Карточка' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Карточка' })).not.toHaveAttribute('aria-busy');
    expect(nativeInput(container)).toBeDisabled();
  });

  it('applies the events to the button and fires onClick once beside opening the picker', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    const { container } = render(
      <FileInput events={{ onClick, onPointerEnter, onPointerLeave }} onFileChange={vi.fn()}>
        Фото
      </FileInput>,
    );
    const click = vi.spyOn(nativeInput(container), 'click');
    const button = screen.getByRole('button', { name: 'Фото' });
    await user.hover(button);
    expect(onPointerEnter).toHaveBeenCalledTimes(1);
    await user.unhover(button);
    expect(onPointerLeave).toHaveBeenCalledTimes(1);
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });
});
