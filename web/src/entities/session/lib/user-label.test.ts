import { describe, expect, it } from 'vitest';

import { NO_NAME_LABEL, userInitials, userName } from './user-label';

function user(name: string | null, email = 'anna@example.com') {
  return { id: 'u1', email, name };
}

describe('userInitials', () => {
  it('takes the first letter of the name, upper-cased', () => {
    expect(userInitials(user('анна'))).toBe('А');
  });

  it('trims the name first', () => {
    expect(userInitials(user('  борис '))).toBe('Б');
  });

  it('takes the email first letter, upper-cased, when there is no name', () => {
    expect(userInitials(user(null, 'zoe@example.com'))).toBe('Z');
  });

  it.each(['', '   '])('falls back to the email for the name %j', (name) => {
    expect(userInitials(user(name, 'mike@example.com'))).toBe('M');
  });

  it('keeps a letter outside the BMP whole', () => {
    expect(userInitials(user('𝒜nna'))).toBe('𝒜');
  });
});

describe('userName', () => {
  it('gives the trimmed name', () => {
    expect(userName(user('  Анна '))).toBe('Анна');
  });

  it.each([null, '', '   '])('gives "Профиль" for the name %j', (name) => {
    expect(userName(user(name))).toBe(NO_NAME_LABEL);
    expect(NO_NAME_LABEL).toBe('Профиль');
  });

  it('never gives the email', () => {
    expect(userName(user(null, 'secret@example.com'))).not.toContain('secret');
  });
});
