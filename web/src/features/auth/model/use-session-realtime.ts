'use client';

import type { SessionState } from '@/entities/session';
import { useRealtimeConnection } from '@/shared/realtime';

// The live connection follows the session (spec 0019 plan §6): it opens while a user is signed in
// and closes when the session ends, as `useDropUserQueries` drops the user's answers; a failed read
// is not an end. The api keeps a socket in its user's room until it closes (A35), so another user
// signed in with no end seen in between gets a connection of their own. Mounted once, by the
// header's profile icon.
export function useSessionRealtime(session: SessionState): void {
  let userId: string | null | undefined;
  if (session.status === 'signed-in') userId = session.user.id;
  else if (session.status === 'signed-out' && !session.failed) userId = null;
  useRealtimeConnection(userId);
}
