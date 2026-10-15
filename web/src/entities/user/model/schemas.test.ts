import { describe, expect, it } from 'vitest';

import { userSchema } from './schemas';

const user = {
  id: '3f0c1d52-8a4e-4b7e-9c55-0d2d6a8f1a11',
  phone: '+79990000000',
  email: 'a@example.com',
  firstName: 'Anna',
  lastName: null,
  patronymic: null,
  dateOfBirth: '1990-05-17',
  gender: 'female',
  fittingProfileImageKey: null,
  createdAt: '2026-10-15T08:00:00.000Z',
  updatedAt: '2026-10-15T08:00:00.000Z',
};

describe('userSchema', () => {
  it('accepts a user and keeps the birth date as a plain date string', () => {
    expect(userSchema.parse(user)).toEqual(user);
  });

  it('accepts a null gender and a null birth date', () => {
    expect(userSchema.safeParse({ ...user, gender: null, dateOfBirth: null }).success).toBe(true);
  });

  it('fails on an unknown gender', () => {
    expect(userSchema.safeParse({ ...user, gender: 'other' }).success).toBe(false);
  });

  it('refuses a birth date with a time part', () => {
    expect(userSchema.safeParse({ ...user, dateOfBirth: '1990-05-17T00:00:00.000Z' }).success).toBe(
      false,
    );
  });

  it('drops an unknown extra field', () => {
    expect(userSchema.parse({ ...user, surprise: 1 })).not.toHaveProperty('surprise');
  });
});
