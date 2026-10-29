import { afterEach, describe, expect, it } from 'vitest';

import { pastedImage, typingIn } from './paste';

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('typingIn', () => {
  it.each([
    '<textarea></textarea>',
    '<input>',
    '<input type="text">',
    '<input type="search">',
    '<input type="email">',
    '<input type="number">',
    '<div contenteditable="true"></div>',
    '<div contenteditable></div>',
  ])('is true for %s', (html) => {
    expect(typingIn(mount(html).firstElementChild)).toBe(true);
  });

  it('is true for an element inside an editable one', () => {
    const host = mount('<div contenteditable="true"><span>text</span></div>');
    expect(typingIn(host.querySelector('span'))).toBe(true);
  });

  it.each([
    '<input type="checkbox">',
    '<input type="radio">',
    '<input type="button">',
    '<input type="submit">',
    '<input type="reset">',
    '<input type="file">',
    '<input type="range">',
    '<input type="color">',
    '<button></button>',
    '<div></div>',
    '<div contenteditable="false"></div>',
  ])('is false for %s', (html) => {
    expect(typingIn(mount(html).firstElementChild)).toBe(false);
  });

  it('is false for the document, the window and nothing', () => {
    expect(typingIn(document)).toBe(false);
    expect(typingIn(window)).toBe(false);
    expect(typingIn(null)).toBe(false);
  });
});

describe('pastedImage', () => {
  interface Item {
    kind: string;
    type: string;
    file: File | null;
  }
  const file = (name: string, type: string) => new File(['x'], name, { type });
  const data = (items: Item[]) =>
    ({
      items: items.map((item) => ({
        kind: item.kind,
        type: item.type,
        getAsFile: () => item.file,
      })),
    }) as unknown as DataTransfer;

  it('is null without clipboard data', () => {
    expect(pastedImage(null)).toBeNull();
  });

  it('is null for an empty clipboard', () => {
    expect(pastedImage(data([]))).toBeNull();
  });

  it('is null for text', () => {
    expect(pastedImage(data([{ kind: 'string', type: 'text/plain', file: null }]))).toBeNull();
  });

  it('is null for a file that is not an image', () => {
    const pdf = file('a.pdf', 'application/pdf');
    expect(pastedImage(data([{ kind: 'file', type: 'application/pdf', file: pdf }]))).toBeNull();
  });

  it('gives the image file', () => {
    const picture = file('shot.png', 'image/png');
    expect(pastedImage(data([{ kind: 'file', type: 'image/png', file: picture }]))).toBe(picture);
  });

  it('gives the first image among other items', () => {
    const first = file('one.png', 'image/png');
    const second = file('two.jpg', 'image/jpeg');
    const pasted = data([
      { kind: 'string', type: 'text/html', file: null },
      { kind: 'file', type: 'application/pdf', file: file('a.pdf', 'application/pdf') },
      { kind: 'file', type: 'image/png', file: first },
      { kind: 'file', type: 'image/jpeg', file: second },
    ]);
    expect(pastedImage(pasted)).toBe(first);
  });

  it('skips an image item whose file is gone', () => {
    const second = file('two.jpg', 'image/jpeg');
    const pasted = data([
      { kind: 'file', type: 'image/png', file: null },
      { kind: 'file', type: 'image/jpeg', file: second },
    ]);
    expect(pastedImage(pasted)).toBe(second);
  });

  it('ignores an image type on a string item', () => {
    expect(pastedImage(data([{ kind: 'string', type: 'image/png', file: null }]))).toBeNull();
  });
});
