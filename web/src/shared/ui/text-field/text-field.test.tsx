import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TextField } from '@/shared/ui';

describe('TextField', () => {
  it('names the input by its label and focuses it on a label click', async () => {
    const user = userEvent.setup();
    render(<TextField label="Имя" />);

    const input = screen.getByRole('textbox', { name: 'Имя' });
    await user.click(screen.getByText('Имя'));

    expect(input).toHaveFocus();
  });

  it('focuses the input on a label click when the label has floated up', async () => {
    const user = userEvent.setup();
    render(<TextField label="Имя" defaultValue="Анна" />);

    const input = screen.getByRole('textbox', { name: 'Имя' });
    await user.click(screen.getByText('Имя'));

    expect(input).toHaveFocus();
  });

  it('does not focus a disabled input on a label click', async () => {
    const user = userEvent.setup();
    render(<TextField label="Фамилия" disabled />);

    await user.click(screen.getByText('Фамилия'));

    expect(screen.getByRole('textbox', { name: 'Фамилия' })).not.toHaveFocus();
  });

  it('renders a long error in full as the description', () => {
    const error = 'Номер указан неверно, '.repeat(20).trim();
    render(<TextField label="Телефон" error={error} />);

    expect(screen.getByRole('textbox', { name: 'Телефон' })).toHaveAccessibleDescription(error);
    expect(screen.getByText(error)).toBeInTheDocument();
  });

  it('describes the input with the hint', () => {
    render(<TextField label="Почта" hint="Пришлём чек" />);

    expect(screen.getByRole('textbox', { name: 'Почта' })).toHaveAccessibleDescription(
      'Пришлём чек',
    );
  });

  it('marks the input invalid and describes it with the error instead of the hint', () => {
    render(<TextField label="Телефон" hint="Пришлём чек" error="Неверный формат номера" />);

    const input = screen.getByRole('textbox', { name: 'Телефон' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Неверный формат номера');
    expect(screen.queryByText('Пришлём чек')).not.toBeInTheDocument();
  });

  it('is not invalid without an error', () => {
    render(<TextField label="Имя" hint="Как в паспорте" />);

    expect(screen.getByRole('textbox', { name: 'Имя' })).not.toHaveAttribute('aria-invalid');
  });

  it('disables the input', () => {
    render(<TextField label="Фамилия" disabled />);

    expect(screen.getByRole('textbox', { name: 'Фамилия' })).toBeDisabled();
  });

  it('accepts typing and reports the value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TextField label="Имя" defaultValue="А" onValueChange={onValueChange} />);

    const input = screen.getByRole('textbox', { name: 'Имя' });
    await user.type(input, 'нна');

    expect(input).toHaveValue('Анна');
    expect(onValueChange).toHaveBeenLastCalledWith('Анна', expect.anything());
  });

  it('passes native props to the input and the class to the root', () => {
    const { container } = render(
      <TextField label="Почта" type="email" name="email" className="custom" />,
    );

    const input = screen.getByRole('textbox', { name: 'Почта' });
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('name', 'email');
    expect(container.firstElementChild).toHaveClass('custom');
    expect(input).not.toHaveClass('custom');
  });

  it('sets data-filled on the root while it has a value', async () => {
    const user = userEvent.setup();
    const { container } = render(<TextField label="Имя" />);
    const root = container.firstElementChild;

    expect(root).not.toHaveAttribute('data-filled');
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), 'А');

    expect(root).toHaveAttribute('data-filled');
  });

  it('is filled from the start with a defaultValue', () => {
    const { container } = render(<TextField label="Имя" defaultValue="Анна" />);

    expect(container.firstElementChild).toHaveAttribute('data-filled');
  });

  it('sets data-focused on the root only while focused', async () => {
    const user = userEvent.setup();
    const { container } = render(<TextField label="Имя" />);
    const root = container.firstElementChild;

    await user.click(screen.getByRole('textbox', { name: 'Имя' }));
    expect(root).toHaveAttribute('data-focused');

    await user.tab();
    expect(root).not.toHaveAttribute('data-focused');
  });
});
