import { describe, expect, it } from 'vitest';

import { jsonLdText } from './json-ld';

describe('jsonLdText', () => {
  it('escapes every less-than sign, so a name cannot end the script', () => {
    const name = '</script><script>alert(1)</script> <b>';
    const text = jsonLdText({ '@graph': [{ name }] });
    expect(text).not.toContain('<');
    expect(text).toContain('\\' + 'u003c/script>');
    expect(JSON.parse(text)).toEqual({ '@graph': [{ name }] });
  });

  it('leaves text without a less-than sign as plain JSON', () => {
    const data = { a: 1, b: ['x', null] };
    expect(jsonLdText(data)).toBe(JSON.stringify(data));
  });
});
