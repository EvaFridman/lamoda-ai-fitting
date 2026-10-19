'use client';

import { useEffect, useMemo, useState } from 'react';

import { ApiError, AUTH_TEMPLATE_PREFIX, reportApiError } from '@/shared/api';
import { authClient, authFailure } from '@/shared/auth';

import { sessionSchema, type SessionUser } from '../model/schemas';

export type SessionState =
  { status: 'pending' } | { status: 'signed-out' } | { status: 'signed-in'; user: SessionUser };

const TEMPLATE = `${AUTH_TEMPLATE_PREFIX}get-session`;

// The visitor's session, read in the browser through Better Auth's client (spec 0013 plan §10),
// which also extends it (N30) and reads it again after a sign-in or sign-out in any tab. Its answer
// goes through the schema like every api answer. A failed read or a wrong answer is reported and
// counts as no session; a failure after a session was read keeps it.
export function useSession(): SessionState {
  const { data, error, isPending } = authClient.useSession();
  const parsed = useMemo(() => (data === null ? null : sessionSchema.safeParse(data)), [data]);

  useEffect(() => {
    if (error) authFailure(error, 'get-session', 'GET');
  }, [error]);

  useEffect(() => {
    if (parsed && !parsed.success) {
      reportApiError(
        new ApiError(`auth answer does not match its schema: ${TEMPLATE}`, {
          kind: 'schema',
          template: TEMPLATE,
          method: 'GET',
          cause: parsed.error,
        }),
      );
    }
  }, [parsed]);

  // The client marks every new read pending while it has no session, the ones it makes when the tab
  // comes back into view too: a visitor without a session stays signed out through them, so the
  // login modal and its text stay open.
  const [answered, setAnswered] = useState(false);
  if (!isPending && !answered) setAnswered(true);

  if (isPending && !answered) return { status: 'pending' };
  if (!parsed?.success) return { status: 'signed-out' };
  return { status: 'signed-in', user: parsed.data.user };
}
