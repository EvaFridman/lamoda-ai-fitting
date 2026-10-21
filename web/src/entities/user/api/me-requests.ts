import { buildPath, clientFetch } from '@/shared/api';

import { userSchema, type Gender, type User } from '../model/schemas';

// UpdateMeDto: only the fields sent change. A name or the date of birth is cleared with `null`;
// the gender cannot be cleared (spec 0017 U9).
export interface UpdateMeBody {
  lastName?: string | null;
  firstName?: string | null;
  patronymic?: string | null;
  dateOfBirth?: string | null;
  gender?: Gender;
}

// PATCH /me: the saved user. Errors are `ApiError`s, already reported; the caller shows them.
export function updateMe(body: UpdateMeBody): Promise<User> {
  return clientFetch(buildPath('/me'), userSchema, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// DELETE /me: a 204 that also expires this browser's session cookies (spec 0013 N11). A 401 means
// the session is already gone, which the caller handles (spec 0017 U25): thrown, not reported.
export function deleteMe(): Promise<undefined> {
  return clientFetch(buildPath('/me'), null, { method: 'DELETE' }, { expectedStatus: 401 });
}
