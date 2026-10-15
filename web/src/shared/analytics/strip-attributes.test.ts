import { describe, expect, it } from 'vitest';

import { stripAttributes } from './strip-attributes';

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

  it('does not mutate its input', () => {
    const input = clickProps();
    stripAttributes('$mp_click', input);
    expect(input).toEqual(clickProps());
  });
});
