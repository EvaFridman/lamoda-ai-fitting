import type { SessionUser } from '../model/schemas';

// What the profile menu shows (spec 0013 AC3, N6): the circle's letter is the name's first one,
// or the email's for a user without a name, and the line beside it is the name or "Профиль". Never
// the email itself.
export const NO_NAME_LABEL = 'Профиль';

function firstLetter(text: string): string {
  // By code point: a letter outside the BMP stays whole.
  return (Array.from(text.trim())[0] ?? '').toLocaleUpperCase('ru');
}

export function userName(user: SessionUser): string {
  return user.name?.trim() || NO_NAME_LABEL;
}

export function userInitials(user: SessionUser): string {
  return firstLetter(user.name ?? '') || firstLetter(user.email);
}
