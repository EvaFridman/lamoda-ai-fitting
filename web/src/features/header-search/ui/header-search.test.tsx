import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HeaderSearch, QUERY_MAX_LENGTH } from './header-search';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: '/path',
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.params,
}));

const ENCODED = '%D0%BF%D0%BB%D0%B0%D1%82%D1%8C%D0%B5';

function setUrl(search: string) {
  navigation.params = new URLSearchParams(search);
}

function field() {
  return screen.getByRole('searchbox', { name: 'Поиск' });
}

function attributeValues(container: HTMLElement): string[] {
  return [container, ...container.querySelectorAll('*')].flatMap((element) =>
    Array.from(element.attributes, (attribute) => attribute.value),
  );
}

describe('HeaderSearch', () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.pathname = '/path';
    setUrl('');
  });

  it('pushes the trimmed query to /catalog on Enter, from a page with no parameters', async () => {
    navigation.pathname = '/privacy';
    const user = userEvent.setup();
    render(<HeaderSearch />);
    await user.type(field(), ' платье {Enter}');
    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(navigation.push).toHaveBeenCalledWith(`/catalog?q=${ENCODED}`);
  });

  it('pushes only q from a category page, dropping the category, filters, sort and cursor', async () => {
    navigation.pathname = '/catalog/shoes';
    setUrl('brandId=x&sort=price_asc&cursor=abc&q=old');
    const user = userEvent.setup();
    render(<HeaderSearch />);
    await user.clear(field());
    await user.type(field(), 'платье{Enter}');
    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(navigation.push).toHaveBeenCalledWith(`/catalog?q=${ENCODED}`);
  });

  it('pushes the query when "Найти" is clicked', async () => {
    navigation.pathname = '/catalog/shoes';
    setUrl('brandId=x&cursor=abc');
    const user = userEvent.setup();
    render(<HeaderSearch />);
    await user.type(field(), 'платье');
    await user.click(screen.getByRole('button', { name: 'Найти' }));
    expect(navigation.push).toHaveBeenCalledWith(`/catalog?q=${ENCODED}`);
  });

  it('pushes again when the submitted query equals the q in the url (O89)', async () => {
    setUrl('q=shirt');
    const user = userEvent.setup();
    render(<HeaderSearch />);
    await user.click(field());
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    expect(navigation.push).toHaveBeenCalledTimes(2);
    expect(navigation.push).toHaveBeenNthCalledWith(1, '/catalog?q=shirt');
    expect(navigation.push).toHaveBeenNthCalledWith(2, '/catalog?q=shirt');
  });

  it('has the placeholder "Товар, бренд или артикул" (O14)', () => {
    render(<HeaderSearch />);
    expect(field()).toHaveAttribute('placeholder', 'Товар, бренд или артикул');
  });

  it('pushes nothing for an empty or blank query', async () => {
    const user = userEvent.setup();
    render(<HeaderSearch />);
    await user.type(field(), '{Enter}');
    await user.click(screen.getByRole('button', { name: 'Найти' }));
    await user.type(field(), '   {Enter}');
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('fills the field with q from the url', () => {
    setUrl('q=платье');
    render(<HeaderSearch />);
    expect(field()).toHaveValue('платье');
  });

  it('leaves the field empty with no q in the url', () => {
    setUrl('a=1');
    render(<HeaderSearch />);
    expect(field()).toHaveValue('');
  });

  it('refreshes the field when q in the url changes, even after typing', async () => {
    setUrl('q=one');
    const user = userEvent.setup();
    const { rerender } = render(<HeaderSearch />);
    await user.type(field(), ' typed');
    expect(field()).toHaveValue('one typed');
    setUrl('q=two');
    rerender(<HeaderSearch />);
    expect(field()).toHaveValue('two');
  });

  it('empties the field on reset and pushes nothing', async () => {
    setUrl('q=платье');
    const user = userEvent.setup();
    render(<HeaderSearch />);
    await user.click(screen.getByRole('button', { name: 'Очистить' }));
    expect(field()).toHaveValue('');
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('puts neither the url query nor typed text into any attribute', async () => {
    setUrl('q=секретныйзапрос&a=1');
    const user = userEvent.setup();
    const { container } = render(<HeaderSearch />);
    await user.type(field(), 'набранныйтекст');
    const values = attributeValues(container);
    expect(field()).toHaveValue('секретныйзапроснабранныйтекст');
    expect(values.some((value) => value.includes('секретныйзапрос'))).toBe(false);
    expect(values.some((value) => value.includes('набранныйтекст'))).toBe(false);
  });

  it('encodes special characters so the query round-trips', async () => {
    const query = 'a&b #c+d e/f';
    const user = userEvent.setup();
    render(<HeaderSearch />);
    await user.type(field(), `${query}{Enter}`);
    const url = navigation.push.mock.calls[0]?.[0] as string;
    expect(url.startsWith('/catalog?')).toBe(true);
    const search = url.split('?')[1] as string;
    expect(search).not.toMatch(/[ #/]/);
    expect(new URLSearchParams(search).get('q')).toBe(query);
  });

  describe('query length limit', () => {
    it('limits the input to 100 characters', () => {
      render(<HeaderSearch />);
      expect(QUERY_MAX_LENGTH).toBe(100);
      expect(field()).toHaveAttribute('maxlength', '100');
    });

    it('shows only the first 100 characters of a longer q from the url', () => {
      const long = 'a'.repeat(100) + 'b'.repeat(50);
      setUrl(`q=${long}`);
      render(<HeaderSearch />);
      expect(field()).toHaveValue('a'.repeat(100));
    });

    it('shows a q of exactly 100 characters whole', () => {
      const exact = 'я'.repeat(100);
      setUrl(`q=${exact}`);
      render(<HeaderSearch />);
      expect(field()).toHaveValue(exact);
    });

    it('keeps 100 typed characters of 150 and pushes them', async () => {
      const user = userEvent.setup();
      render(<HeaderSearch />);
      await user.type(field(), 'a'.repeat(100) + 'b'.repeat(50));
      expect(field()).toHaveValue('a'.repeat(100));
      await user.keyboard('{Enter}');
      expect(navigation.push).toHaveBeenCalledWith(`/catalog?q=${'a'.repeat(100)}`);
    });
  });
});
