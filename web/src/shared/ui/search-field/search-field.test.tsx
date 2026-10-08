import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SearchField } from '@/shared/ui';

describe('SearchField', () => {
  it('renders a search form with a named searchbox, placeholder and submit button', () => {
    render(<SearchField />);

    const form = screen.getByRole('search');
    const input = screen.getByRole('searchbox', { name: 'Поиск' });
    expect(form).toContainElement(input);
    expect(input).toHaveAttribute('placeholder', 'Товар, бренд или артикул');
    expect(screen.getByRole('button', { name: 'Найти' })).toHaveAttribute('type', 'submit');
  });

  it('takes the accessible name from the label prop', () => {
    render(<SearchField label="Поиск по каталогу" />);

    expect(screen.getByRole('searchbox', { name: 'Поиск по каталогу' })).toBeInTheDocument();
  });

  it('calls onSearch with the trimmed value on Enter', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchField onSearch={onSearch} />);

    await user.type(screen.getByRole('searchbox'), '  платье {Enter}');

    expect(onSearch).toHaveBeenCalledExactlyOnceWith('платье');
  });

  it('calls onSearch on a click on "Найти"', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchField onSearch={onSearch} defaultValue="кроссовки" />);

    await user.click(screen.getByRole('button', { name: 'Найти' }));

    expect(onSearch).toHaveBeenCalledExactlyOnceWith('кроссовки');
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('does not call onSearch for an %s value', async (_name, text) => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchField onSearch={onSearch} />);

    if (text) await user.type(screen.getByRole('searchbox'), text);
    await user.click(screen.getByRole('button', { name: 'Найти' }));

    expect(onSearch).not.toHaveBeenCalled();
  });

  it('prevents the default form submit', () => {
    render(<SearchField defaultValue="платье" />);

    // fireEvent returns false when a handler called preventDefault
    const notPrevented = fireEvent.submit(screen.getByRole('search'));

    expect(notPrevented).toBe(false);
  });

  it('shows "Очистить" only while filled', async () => {
    const user = userEvent.setup();
    render(<SearchField />);
    expect(screen.queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'а');

    expect(screen.getByRole('button', { name: 'Очистить' })).toBeInTheDocument();
  });

  it('clears the field, focuses it and reports an empty value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SearchField defaultValue="Кроссовки" onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button', { name: 'Очистить' }));

    const input = screen.getByRole('searchbox');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(onValueChange).toHaveBeenLastCalledWith('');
    expect(screen.queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();
  });

  it('shows the value prop and keeps following it when controlled', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SearchField value="платье" onValueChange={onValueChange} />);

    const input = screen.getByRole('searchbox');
    expect(input).toHaveValue('платье');

    await user.type(input, 'я');

    expect(onValueChange).toHaveBeenLastCalledWith('платьея');
    expect(input).toHaveValue('платье');
  });

  it('disables the input and the buttons, and ignores a submit', () => {
    const onSearch = vi.fn();
    render(<SearchField disabled defaultValue="платье" onSearch={onSearch} />);

    expect(screen.getByRole('searchbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Найти' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();

    fireEvent.submit(screen.getByRole('search'));

    expect(onSearch).not.toHaveBeenCalled();
  });

  it('forwards ref to the search input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<SearchField ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current).toBe(screen.getByRole('searchbox'));
    expect(ref.current).toHaveAttribute('type', 'search');
  });

  it('shows "Очистить" for a whitespace-only value but does not search it', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchField onSearch={onSearch} />);

    await user.type(screen.getByRole('searchbox'), '   {Enter}');

    expect(screen.getByRole('button', { name: 'Очистить' })).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('passes an HTML-looking query to onSearch as plain trimmed text', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchField onSearch={onSearch} defaultValue="  a <b>x</b>  " />);

    await user.click(screen.getByRole('button', { name: 'Найти' }));

    expect(onSearch).toHaveBeenCalledExactlyOnceWith('a <b>x</b>');
  });

  it('leaves the field empty and focused after a double click on "Очистить"', async () => {
    const user = userEvent.setup();
    render(<SearchField defaultValue="Кроссовки" />);

    await user.dblClick(screen.getByRole('button', { name: 'Очистить' }));

    const input = screen.getByRole('searchbox');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });
});
