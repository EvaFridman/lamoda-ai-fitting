import { describe, expect, it } from 'vitest';

import type { User } from '@/entities/user';

import { changesOf, dateError, hasChanges, valuesOf, type ProfileValues } from './profile-values';

const user: User = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  phone: null,
  email: 'eva@example.com',
  firstName: 'Ева',
  lastName: 'Иванова',
  patronymic: null,
  dateOfBirth: '1990-05-12',
  gender: 'female',
  fittingProfileImageKey: null,
  fittingProfileImageUrl: null,
  photoConsentVersion: null,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

function edited(change: Partial<ProfileValues>): ProfileValues {
  return { ...valuesOf(user), ...change };
}

describe('valuesOf', () => {
  it('fills the fields from the user, a missing name as empty and the date masked', () => {
    expect(valuesOf(user)).toEqual({
      lastName: 'Иванова',
      firstName: 'Ева',
      patronymic: '',
      dateOfBirth: '12.05.1990',
      gender: 'female',
    });
  });

  it('keeps no date and no gender as empty and null', () => {
    expect(valuesOf({ ...user, dateOfBirth: null, gender: null })).toMatchObject({
      dateOfBirth: '',
      gender: null,
    });
  });
});

describe('changesOf', () => {
  it('is empty for the values just read', () => {
    expect(changesOf(valuesOf(user), user)).toEqual({});
  });

  it('holds only the fields that changed', () => {
    expect(changesOf(edited({ firstName: 'Анна', gender: 'male' }), user)).toEqual({
      firstName: 'Анна',
      gender: 'male',
    });
  });

  it('trims a name', () => {
    expect(changesOf(edited({ patronymic: '  Петровна ' }), user)).toEqual({
      patronymic: 'Петровна',
    });
  });

  it('sees no change in spaces around an unchanged name', () => {
    expect(changesOf(edited({ firstName: ' Ева  ' }), user)).toEqual({});
  });

  it('sends null for an emptied name, also one of spaces only', () => {
    expect(changesOf(edited({ lastName: '', firstName: '   ' }), user)).toEqual({
      lastName: null,
      firstName: null,
    });
  });

  it('sees no change in an empty name that was empty', () => {
    expect(changesOf(edited({ patronymic: '  ' }), user)).toEqual({});
  });

  it('sends the date as YYYY-MM-DD', () => {
    expect(changesOf(edited({ dateOfBirth: '13.06.1991' }), user)).toEqual({
      dateOfBirth: '1991-06-13',
    });
  });

  it('sends null for a cleared date', () => {
    expect(changesOf(edited({ dateOfBirth: '' }), user)).toEqual({ dateOfBirth: null });
  });

  it.each(['12.05', '31.02.2001'])(
    'leaves out the date %j, not full or not real',
    (dateOfBirth) => {
      expect(changesOf(edited({ dateOfBirth }), user)).toEqual({});
    },
  );

  it('never takes no gender as a change', () => {
    expect(changesOf(edited({ gender: null }), user)).toEqual({});
    expect(changesOf(valuesOf({ ...user, gender: null }), { ...user, gender: null })).toEqual({});
  });

  it('sends a gender chosen for the first time', () => {
    expect(changesOf(edited({ gender: 'male' }), { ...user, gender: null })).toEqual({
      gender: 'male',
    });
  });
});

describe('dateError', () => {
  it('says what is wrong with a date being typed', () => {
    expect(dateError('12.05')).toBe('Введите дату полностью');
    expect(dateError('31.02.2001')).toBe('Такой даты нет');
  });

  it('is none for an empty or a real date', () => {
    expect(dateError('')).toBeUndefined();
    expect(dateError('12.05.1990')).toBeUndefined();
  });
});

describe('hasChanges', () => {
  it('is false for the values just read and again when a value is changed back', () => {
    expect(hasChanges(valuesOf(user), user)).toBe(false);
    expect(hasChanges(edited({ firstName: 'Анна' }), user)).toBe(true);
    expect(hasChanges(edited({ firstName: 'Ева' }), user)).toBe(false);
  });

  it('is true for a date not full or not real, so the save can say what is wrong', () => {
    expect(hasChanges(edited({ dateOfBirth: '12.05' }), user)).toBe(true);
    expect(hasChanges(edited({ dateOfBirth: '31.02.2001' }), user)).toBe(true);
  });

  it('is false for no gender', () => {
    expect(hasChanges(edited({ gender: null }), user)).toBe(false);
  });
});
