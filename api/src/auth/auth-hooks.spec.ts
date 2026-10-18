import { describe, expect, it } from 'vitest';

import { accountFields, personName, sessionFields, userFields } from './auth-hooks.js';

describe('userFields', () => {
  it('lower-cases, trims and NFC-normalises the email', () => {
    const decomposed = 'й@example.com'.normalize('NFD');

    expect(decomposed).not.toBe('й@example.com');
    expect(userFields({ email: '  Ann.Smith@Example.COM ' }).email).toBe('ann.smith@example.com');
    expect(userFields({ email: decomposed }).email).toBe('й@example.com');
  });

  it('never writes an image', () => {
    const fields = userFields({ email: 'a@example.com', image: 'https://example.com/a.png' });

    expect(fields).toHaveProperty('image', undefined);
  });

  it('keeps a given name that passes the name rule', () => {
    expect(userFields({ name: 'Ева' }).name).toBe('Ева');
    expect(userFields({ name: "Jean-Luc d'Arc" }).name).toBe("Jean-Luc d'Arc");
  });

  it.each([
    ['digits', 'R2D2'],
    ['one letter', 'A'],
    ['51 letters', 'a'.repeat(51)],
    ['an outer space', ' Ann'],
    ['a double space', 'Ann  Lee'],
    ['an empty string', ''],
    ['emoji', 'Ann 😀'],
  ])('stores null for a name with %s', (_case, name) => {
    expect(userFields({ name }).name).toBeNull();
  });

  it('keeps the bounds: 2 and 50 letters pass', () => {
    expect(userFields({ name: 'Ан' }).name).toBe('Ан');
    expect(userFields({ name: 'a'.repeat(50) }).name).toBe('a'.repeat(50));
  });

  it('stores null for a name that is not a string', () => {
    expect(userFields({ name: undefined }).name).toBeNull();
    expect(userFields({ name: 5 }).name).toBeNull();
    expect(personName(null)).toBeNull();
  });

  it('leaves out the fields the write does not carry', () => {
    const fields = userFields({ emailVerified: true });

    expect(fields).not.toHaveProperty('email');
    expect(fields).not.toHaveProperty('name');
  });
});

describe('accountFields', () => {
  it('nulls every token field', () => {
    expect(accountFields()).toEqual({
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
    });
  });
});

describe('sessionFields', () => {
  it('never writes an IP address', () => {
    expect(sessionFields()).toHaveProperty('ipAddress', undefined);
  });

  it('never writes a User-Agent (N34)', () => {
    expect(sessionFields()).toHaveProperty('userAgent', undefined);
  });
});
