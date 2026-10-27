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
  fittingProfileImageUrl: null,
  photoConsentVersion: null,
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

  it('accepts a signed photo link and refuses one that is not a URL', () => {
    const key = 'keep/users/u/photos/a.webp';
    const url = `http://storage.example/bucket/${key}?X-Amz-Signature=abc`;

    expect(
      userSchema.parse({ ...user, fittingProfileImageKey: key, fittingProfileImageUrl: url }),
    ).toMatchObject({ fittingProfileImageUrl: url });
    expect(userSchema.safeParse({ ...user, fittingProfileImageUrl: 'not a url' }).success).toBe(
      false,
    );
  });

  it('refuses a user with no photo link field', () => {
    const { fittingProfileImageUrl: _link, ...rest } = user;

    expect(userSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts a consent version number and refuses a missing one or a string', () => {
    const { photoConsentVersion: _version, ...rest } = user;

    expect(userSchema.parse({ ...user, photoConsentVersion: 1 })).toMatchObject({
      photoConsentVersion: 1,
    });
    expect(userSchema.safeParse(rest).success).toBe(false);
    expect(userSchema.safeParse({ ...user, photoConsentVersion: '1' }).success).toBe(false);
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
