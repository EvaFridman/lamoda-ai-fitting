import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stripAttributes, stripPeopleAddresses, stripStoredReferrer } from './strip-attributes';

describe('stripStoredReferrer', () => {
  function sdk(stored: unknown) {
    return { get_property: vi.fn(() => stored), register: vi.fn() };
  }

  it.each([
    [
      'q',
      'https://lamoda-ai-fitting.ru/catalog?q=secret&sort=new',
      'https://lamoda-ai-fitting.ru/catalog?sort=new',
    ],
    [
      'q alone',
      'https://lamoda-ai-fitting.ru/catalog?q=secret',
      'https://lamoda-ai-fitting.ru/catalog',
    ],
    [
      'a fragment',
      'https://lamoda-ai-fitting.ru/catalog#secret',
      'https://lamoda-ai-fitting.ru/catalog',
    ],
    [
      'fitting',
      'https://lamoda-ai-fitting.ru/customer/fittings?fitting=3f2b8c1e&product=p',
      'https://lamoda-ai-fitting.ru/customer/fittings?product=p',
    ],
    [
      'fitting alone',
      'https://lamoda-ai-fitting.ru/customer/fittings?fitting=3f2b8c1e',
      'https://lamoda-ai-fitting.ru/customer/fittings',
    ],
    [
      'the compared fittings',
      'https://lamoda-ai-fitting.ru/customer/fittings/compare?a=3f2b8c1e&b=9d0e4a7c',
      'https://lamoda-ai-fitting.ru/customer/fittings/compare',
    ],
  ])('registers the referrer without %s', (_, stored, stripped) => {
    const mixpanel = sdk(stored);
    stripStoredReferrer(mixpanel);
    expect(mixpanel.get_property).toHaveBeenCalledWith('$initial_referrer');
    expect(mixpanel.register).toHaveBeenCalledTimes(1);
    expect(mixpanel.register).toHaveBeenCalledWith({ $initial_referrer: stripped });
  });

  it.each([
    ['$direct', '$direct'],
    ['nothing stored', undefined],
    ['an address with no q or fragment', 'https://www.google.com/search?hl=ru'],
  ])('registers nothing for %s', (_, stored) => {
    const mixpanel = sdk(stored);
    stripStoredReferrer(mixpanel);
    expect(mixpanel.register).not.toHaveBeenCalled();
  });
});

describe('stripAttributes without URL.canParse', () => {
  const canParse = URL.canParse;

  beforeEach(() => {
    // An older browser has no `URL.canParse`.
    Object.defineProperty(URL, 'canParse', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });
  afterEach(() => {
    Object.defineProperty(URL, 'canParse', { value: canParse, configurable: true, writable: true });
  });

  it('still strips q and leaves values that are not addresses', () => {
    const [, props] = stripAttributes('$mp_web_page_view', {
      $current_url: 'https://lamoda-ai-fitting.ru/catalog?q=secret&sort=new#x',
      $referrer: '$direct',
      $initial_referrer: 'not a url',
    });
    expect(props).toEqual({
      $current_url: 'https://lamoda-ai-fitting.ru/catalog?sort=new',
      $referrer: '$direct',
      $initial_referrer: 'not a url',
    });
  });
});

describe('stripAttributes drops the fitting parameter from every address', () => {
  const withFitting = 'https://lamoda-ai-fitting.ru/customer/fittings?fitting=3f2b8c1e&tab=1';
  const without = 'https://lamoda-ai-fitting.ru/customer/fittings?tab=1';

  it.each(['$current_url', '$referrer', '$initial_referrer'])('in %s', (key) => {
    const [, props] = stripAttributes('$mp_web_page_view', { [key]: withFitting });
    expect(props).toEqual({ [key]: without });
  });

  it('in current_url_search, a bare query', () => {
    expect(
      stripAttributes('$mp_web_page_view', { current_url_search: '?fitting=3f2b8c1e&tab=1' })[1],
    ).toEqual({ current_url_search: '?tab=1' });
    expect(
      stripAttributes('$mp_web_page_view', { current_url_search: '?fitting=3f2b8c1e' })[1],
    ).toEqual({ current_url_search: '' });
  });

  it('drops the compare page ids a and b from the addresses and the query', () => {
    const [, props] = stripAttributes('$mp_web_page_view', {
      $current_url: 'https://lamoda-ai-fitting.ru/customer/fittings/compare?a=1&b=2',
      current_url_search: '?a=1&b=2',
    });
    expect(props).toEqual({
      $current_url: 'https://lamoda-ai-fitting.ru/customer/fittings/compare',
      current_url_search: '',
    });
    expect(
      stripAttributes('$mp_web_page_view', { current_url_search: '?a=1&sort=new&b=2' })[1],
    ).toEqual({ current_url_search: '?sort=new' });
  });

  it('keeps an address with no fitting as it is', () => {
    expect(stripAttributes('$mp_web_page_view', { $current_url: without })[1]).toEqual({
      $current_url: without,
    });
  });
});

describe('stripPeopleAddresses', () => {
  it('strips the fitting parameter from the addresses of $set_once and $set', () => {
    const dirty = 'https://lamoda-ai-fitting.ru/customer/fittings?fitting=3f2b8c1e';
    const clean = 'https://lamoda-ai-fitting.ru/customer/fittings';
    expect(
      stripPeopleAddresses({
        $set_once: { $initial_referrer: dirty },
        $set: { $current_url: dirty },
      }),
    ).toEqual({ $set_once: { $initial_referrer: clean }, $set: { $current_url: clean } });
  });

  const full = 'https://lamoda-ai-fitting.ru/catalog?q=secret&sort=new#top';
  const clean = 'https://lamoda-ai-fitting.ru/catalog?sort=new';

  it('strips q and the fragment from the addresses of $set_once and $set', () => {
    const data = {
      $token: 't',
      $set_once: { $initial_referrer: full, $referrer: full, $current_url: full, $name: 'x' },
      $set: { $current_url: full, $referrer: '$direct', plan: 'a' },
    };
    expect(stripPeopleAddresses(data)).toEqual({
      $token: 't',
      $set_once: { $initial_referrer: clean, $referrer: clean, $current_url: clean, $name: 'x' },
      $set: { $current_url: clean, $referrer: '$direct', plan: 'a' },
    });
  });

  it('leaves other keys and other operations untouched', () => {
    const data = { $add: { $initial_referrer: full }, $unset: ['a'], $distinct_id: 'u' };
    expect(stripPeopleAddresses(data)).toEqual(data);
  });

  it('copes with a missing or malformed operation', () => {
    expect(stripPeopleAddresses({ $set: null, $set_once: 'x' })).toEqual({
      $set: null,
      $set_once: 'x',
    });
    expect(stripPeopleAddresses({})).toEqual({});
  });

  it('does not mutate its input', () => {
    const data = { $set_once: { $initial_referrer: full } };
    stripPeopleAddresses(data);
    expect(data).toEqual({ $set_once: { $initial_referrer: full } });
  });
});

function element() {
  return {
    $classes: ['btn', 'primary'],
    $tag_name: 'a',
    $nth_child: 2,
    $nth_of_type: 1,
    $id: 'buy',
    '$attr-title': 'Buy',
    '$attr-aria-label': 'Buy now',
    '$attr-href': '/products/secret',
    '$attr-name': 'buy-button',
  };
}

const KEPT = { $classes: ['btn', 'primary'], $tag_name: 'a', $nth_child: 2, $nth_of_type: 1 };

function clickProps() {
  return {
    $elements: [element(), element()],
    $target: element(),
    $el_attr__href: '/products/secret',
    $el_id: 'buy',
    $el_text: 'Buy now',
    $el_classes: ['btn', 'primary'],
    $el_tag_name: 'a',
    $pathname: '/products',
    $x: 10,
    $y: 20,
    $captured_for_heatmap: true,
  };
}

describe('stripAttributes', () => {
  it('keeps only classes, tag and position in $elements and $target, and drops copied attributes', () => {
    const [name, props] = stripAttributes('$mp_click', clickProps());
    expect(name).toBe('$mp_click');
    expect(props).toEqual({
      $elements: [KEPT, KEPT],
      $target: KEPT,
      $el_classes: ['btn', 'primary'],
      $el_tag_name: 'a',
      $pathname: '/products',
      $x: 10,
      $y: 20,
      $captured_for_heatmap: true,
    });
    expect(props).not.toHaveProperty('$el_attr__href');
    expect(props).not.toHaveProperty('$el_id');
    expect(props).not.toHaveProperty('$el_text');
  });

  it('passes our own events unchanged', () => {
    const [name, props] = stripAttributes('Element Clicked', { element: 'ui-kit.button-primary' });
    expect(name).toBe('Element Clicked');
    expect(props).toEqual({ element: 'ui-kit.button-primary' });
  });

  it('does not throw on non-object entries in $elements', () => {
    const [, props] = stripAttributes('$mp_click', {
      $elements: ['text', 5, null, element()],
    });
    expect(props.$elements).toEqual(['text', 5, null, KEPT]);
  });

  describe('the search text in the page address (O104)', () => {
    it.each(['$current_url', '$referrer', '$initial_referrer'])(
      'removes q and the fragment from %s and keeps the other parameters',
      (key) => {
        const [, props] = stripAttributes('$mp_web_page_view', {
          [key]: 'https://lamoda-ai-fitting.ru/catalog/dresses?q=red+dress&sort=new#top',
        });
        expect(props[key]).toBe('https://lamoda-ai-fitting.ru/catalog/dresses?sort=new');
      },
    );

    it('removes the fragment of an address that has no q, and leaves one with neither as it is', () => {
      const [, props] = stripAttributes('$mp_web_page_view', {
        $current_url: 'https://lamoda-ai-fitting.ru/catalog?sort=new#secret',
        $referrer: 'https://lamoda-ai-fitting.ru/catalog#secret',
        $initial_referrer: 'https://lamoda-ai-fitting.ru/catalog?sort=new',
      });
      expect(props).toEqual({
        $current_url: 'https://lamoda-ai-fitting.ru/catalog?sort=new',
        $referrer: 'https://lamoda-ai-fitting.ru/catalog',
        $initial_referrer: 'https://lamoda-ai-fitting.ru/catalog?sort=new',
      });
    });

    it('drops mp_keyword from every event', () => {
      const [, view] = stripAttributes('$mp_web_page_view', { mp_keyword: 'google', $x: 1 });
      const [, own] = stripAttributes('Element Clicked', { mp_keyword: 'google', element: 'a.b' });
      expect(view).toEqual({ $x: 1 });
      expect(own).toEqual({ element: 'a.b' });
    });

    it('drops the ? when q was the only parameter', () => {
      const [, props] = stripAttributes('$mp_click', {
        $current_url: 'https://lamoda-ai-fitting.ru/catalog?q=secret',
        $referrer: 'https://lamoda-ai-fitting.ru/catalog?sort=new&q=secret',
      });
      expect(props.$current_url).toBe('https://lamoda-ai-fitting.ru/catalog');
      expect(props.$referrer).toBe('https://lamoda-ai-fitting.ru/catalog?sort=new');
    });

    it('leaves an address without q, and values that are not addresses, as they are', () => {
      const url = 'https://lamoda-ai-fitting.ru/catalog?sort=new&brandId=a%2Cb';
      const [, props] = stripAttributes('$mp_web_page_view', {
        $current_url: url,
        $referrer: '$direct',
        $initial_referrer: '$direct',
      });
      expect(props).toEqual({
        $current_url: url,
        $referrer: '$direct',
        $initial_referrer: '$direct',
      });
    });

    it('does not touch the address of another site except its q', () => {
      const [, props] = stripAttributes('$mp_web_page_view', {
        $referrer: 'https://www.google.com/search?q=lamoda&hl=ru',
      });
      expect(props.$referrer).toBe('https://www.google.com/search?hl=ru');
    });

    it('removes q from current_url_search', () => {
      const search = (value: string) =>
        stripAttributes('$mp_web_page_view', { current_url_search: value })[1];
      expect(search('?q=x&sort=new')).toEqual({ current_url_search: '?sort=new' });
      expect(search('?q=x')).toEqual({ current_url_search: '' });
      expect(search('?sort=new')).toEqual({ current_url_search: '?sort=new' });
      expect(search('')).toEqual({ current_url_search: '' });
    });

    it('applies to the SDK click events and keeps their other properties', () => {
      const [, props] = stripAttributes('$mp_click', {
        ...clickProps(),
        $current_url: 'https://lamoda-ai-fitting.ru/catalog?q=a',
        current_url_search: '?q=a',
      });
      expect(props.$current_url).toBe('https://lamoda-ai-fitting.ru/catalog');
      expect(props.current_url_search).toBe('');
      expect(props.$x).toBe(10);
      expect(props.$pathname).toBe('/products');
    });

    it('leaves other properties that look like addresses alone', () => {
      const [, props] = stripAttributes('Element Clicked', { link: 'https://x.ru/?q=1' });
      expect(props).toEqual({ link: 'https://x.ru/?q=1' });
    });
  });

  it('does not mutate its input', () => {
    const input = clickProps();
    stripAttributes('$mp_click', input);
    expect(input).toEqual(clickProps());
  });
});
