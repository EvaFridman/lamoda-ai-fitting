// The try-on's paste (spec 0024 Z16): an image in the clipboard becomes the chosen photo, unless
// the paste goes into a text field.

// Inputs that take no typed text: a paste while one is focused still reaches the zone.
const NOT_TEXT = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'];
const TEXT_FIELD = `textarea, [contenteditable]:not([contenteditable="false"]), input:not(${NOT_TEXT.map(
  (type) => `[type="${type}"]`,
).join(', ')})`;

/** Whether a paste aimed at `target` goes into a text field (the wishes, a search). */
export function typingIn(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TEXT_FIELD) !== null;
}

/** The clipboard's first image as a file, if it holds one. */
export function pastedImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}
