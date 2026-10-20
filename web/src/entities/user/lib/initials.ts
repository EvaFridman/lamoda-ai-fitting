import type { User } from '../model/schemas';

function firstLetter(text: string | null): string {
  // By code point: a letter outside the BMP stays whole.
  return (Array.from(text?.trim() ?? '')[0] ?? '').toLocaleUpperCase('ru');
}

// The letters of "Мои данные"'s circle (spec 0017 U3): the first and last name's ("ЕФ"), else the
// one name there is, else the email's first letter.
export function profileInitials(user: Pick<User, 'firstName' | 'lastName' | 'email'>): string {
  return firstLetter(user.firstName) + firstLetter(user.lastName) || firstLetter(user.email);
}
