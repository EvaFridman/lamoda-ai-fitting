import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, type ReactElement } from 'react';
import { type Root, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

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

  describe('uncontrolled text stays out of attributes (L9)', () => {
    function attributeValues(root: Element): string[] {
      return [root, ...root.querySelectorAll('*')].flatMap((element) =>
        element.getAttributeNames().map((name) => `${name}=${element.getAttribute(name)}`),
      );
    }

    it('keeps typed text out of every attribute', async () => {
      const user = userEvent.setup();
      render(<SearchField />);

      await user.type(screen.getByRole('searchbox'), 'zxqv-typed-9271');

      expect(screen.getByRole('searchbox')).toHaveValue('zxqv-typed-9271');
      expect(attributeValues(screen.getByRole('search')).join('\n')).not.toContain('zxqv');
    });

    it('shows a defaultValue as the value, not as an attribute, with the reset button', () => {
      render(<SearchField defaultValue="zxqv-default-4410" />);

      expect(screen.getByRole('searchbox')).toHaveValue('zxqv-default-4410');
      expect(attributeValues(screen.getByRole('search')).join('\n')).not.toContain('zxqv');
      expect(screen.getByRole('button', { name: 'Очистить' })).toBeInTheDocument();
    });
  });

  describe('hydration (L9)', () => {
    function attributeValues(root: Element): string[] {
      return [root, ...root.querySelectorAll('*')].flatMap((element) =>
        element.getAttributeNames().map((name) => `${name}=${element.getAttribute(name)}`),
      );
    }

    // Server markup in a container; `typed` plays text entered before hydration. RTL's cleanup does
    // not know this root, so it is removed when the test ends, failed or not.
    async function hydrate(element: ReactElement, typed?: string) {
      const container = document.createElement('div');
      container.innerHTML = renderToString(element);
      document.body.append(container);
      if (typed !== undefined) container.querySelector('input')!.value = typed;
      let root!: Root;
      await act(async () => {
        root = hydrateRoot(container, element);
      });
      onTestFinished(async () => {
        await act(async () => root.unmount());
        container.remove();
      });
      return container;
    }

    it('renders no text into the server HTML for a defaultValue', () => {
      const html = renderToString(<SearchField defaultValue="zxqv-server-5521" />);

      expect(html).not.toContain('zxqv');
    });

    it('keeps text typed before hydration and searches it trimmed', async () => {
      const onSearch = vi.fn();
      const container = await hydrate(<SearchField onSearch={onSearch} />, '  zxqv-typed-1 ');

      expect(within(container).getByRole('searchbox')).toHaveValue('  zxqv-typed-1 ');
      expect(within(container).getByRole('button', { name: 'Очистить' })).toBeInTheDocument();

      fireEvent.submit(within(container).getByRole('search'));

      expect(onSearch).toHaveBeenCalledExactlyOnceWith('zxqv-typed-1');
    });

    it('keeps text typed before hydration over the defaultValue', async () => {
      const container = await hydrate(
        <SearchField defaultValue="zxqv-default-2" />,
        'zxqv-typed-2',
      );

      expect(within(container).getByRole('searchbox')).toHaveValue('zxqv-typed-2');
      expect(within(container).getByRole('button', { name: 'Очистить' })).toBeInTheDocument();
    });

    it('fills an empty hydrated input with the defaultValue, outside attributes', async () => {
      const container = await hydrate(<SearchField defaultValue="zxqv-default-3" />);

      expect(within(container).getByRole('searchbox')).toHaveValue('zxqv-default-3');
      expect(within(container).getByRole('button', { name: 'Очистить' })).toBeInTheDocument();
      expect(attributeValues(container).join('\n')).not.toContain('zxqv');
    });

    it('keeps no attribute with emoji text typed after a prefilled value', async () => {
      const user = userEvent.setup();
      render(<SearchField defaultValue="zxqv-base" />);

      await user.type(screen.getByRole('searchbox'), ' 👗 mixed Ёлка');

      expect(screen.getByRole('searchbox')).toHaveValue('zxqv-base 👗 mixed Ёлка');
      const attributes = attributeValues(screen.getByRole('search')).join('\n');
      expect(attributes).not.toContain('zxqv');
      expect(attributes).not.toContain('👗');
      expect(attributes).not.toContain('Ёлка');
    });
  });

  it('searches the new trimmed text typed after a reset', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchField defaultValue="старое" onSearch={onSearch} />);

    await user.click(screen.getByRole('button', { name: 'Очистить' }));
    await user.type(screen.getByRole('searchbox'), '  новое {Enter}');

    expect(onSearch).toHaveBeenCalledExactlyOnceWith('новое');
  });

  it('applies defaultValue on mount only; a new key applies the new one', () => {
    const { rerender } = render(<SearchField key="a" defaultValue="первое" />);
    expect(screen.getByRole('searchbox')).toHaveValue('первое');

    rerender(<SearchField key="a" defaultValue="второе" />);
    expect(screen.getByRole('searchbox')).toHaveValue('первое');

    rerender(<SearchField key="b" defaultValue="второе" />);
    expect(screen.getByRole('searchbox')).toHaveValue('второе');
  });
});
