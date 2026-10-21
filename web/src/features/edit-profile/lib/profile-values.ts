import type { Gender, UpdateMeBody, User } from '@/entities/user';

import { maskedFromIso, parseMaskedDate } from './date-mask';

export type NameField = 'lastName' | 'firstName' | 'patronymic';
export type ProfileField = NameField | 'dateOfBirth' | 'gender';

// What the form's fields hold: the names as typed, the date as masked.
export interface ProfileValues {
  lastName: string;
  firstName: string;
  patronymic: string;
  dateOfBirth: string;
  gender: Gender | null;
}

export const NAME_FIELDS: readonly NameField[] = ['lastName', 'firstName', 'patronymic'];

export function valuesOf(user: User): ProfileValues {
  return {
    lastName: user.lastName ?? '',
    firstName: user.firstName ?? '',
    patronymic: user.patronymic ?? '',
    dateOfBirth: maskedFromIso(user.dateOfBirth),
    gender: user.gender,
  };
}

// A name as saved: trimmed, and empty as `null`, which clears it (spec 0017 U9).
function nameOf(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// The fields that differ from the saved user, as `PATCH /me` takes them: only those are sent (plan
// §5). A date not yet full or not real is left out (`dateError` stops the save). No gender is
// never a change: once chosen it cannot be cleared.
export function changesOf(values: ProfileValues, user: User): UpdateMeBody {
  const changes: UpdateMeBody = {};
  for (const field of NAME_FIELDS) {
    const name = nameOf(values[field]);
    if (name !== user[field]) changes[field] = name;
  }
  const date = parseMaskedDate(values.dateOfBirth);
  if (date.status === 'empty' || date.status === 'valid') {
    const dateOfBirth = date.status === 'valid' ? date.iso : null;
    if (dateOfBirth !== user.dateOfBirth) changes.dateOfBirth = dateOfBirth;
  }
  if (values.gender !== null && values.gender !== user.gender) changes.gender = values.gender;
  return changes;
}

// The browser's own check of the date: only that a full value is a real date (plan §5).
export function dateError(masked: string): string | undefined {
  const { status } = parseMaskedDate(masked);
  if (status === 'incomplete') return 'Введите дату полностью';
  if (status === 'invalid') return 'Такой даты нет';
  return undefined;
}

// "Сохранить" is active while something differs from the saved user, a date being typed too, so
// the save can say what is wrong with it (spec 0017 U8).
export function hasChanges(values: ProfileValues, user: User): boolean {
  return (
    Object.keys(changesOf(values, user)).length > 0 || dateError(values.dateOfBirth) !== undefined
  );
}
