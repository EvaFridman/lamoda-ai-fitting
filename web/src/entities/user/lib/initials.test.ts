import { describe, expect, it } from 'vitest';

import { profileInitials } from './initials';

function user(firstName: string | null, lastName: string | null, email = 'anna@example.com') {
  return { firstName, lastName, email };
}

describe('profileInitials', () => {
  it('takes the first letters of the first and last name, upper-cased in Russian', () => {
    expect(profileInitials(user('ева', 'фридман'))).toBe('ЕФ');
  });

  it('trims the names first', () => {
    expect(profileInitials(user('  борис ', ' иванов'))).toBe('БИ');
  });

  it.each([
    ['first name only', user('ева', null), 'Е'],
    ['last name only', user(null, 'фридман'), 'Ф'],
  ])('gives the one letter there is for %s', (_name, input, expected) => {
    expect(profileInitials(input)).toBe(expected);
  });

  it('skips a blank name and keeps the other', () => {
    expect(profileInitials(user('   ', 'фридман'))).toBe('Ф');
  });

  it('falls back to the email first letter with no names', () => {
    expect(profileInitials(user(null, null, 'zoe@example.com'))).toBe('Z');
  });

  it('falls back to the email for blank names', () => {
    expect(profileInitials(user('', '  ', 'mike@example.com'))).toBe('M');
  });

  it('keeps a letter outside the BMP whole', () => {
    expect(profileInitials(user('𝒜nna', null))).toBe('𝒜');
  });
});
