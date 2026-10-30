'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { reportFailure } from '@/shared/api';

import type { FittingQuota } from '../model/schemas';
import { markAllFittingsSeen, markFittingSeen } from './fitting-requests';
import { fittingKeys } from './keys';
import { useFittingQuota } from './queries';

// The completed results the user has not opened yet (spec 0024 Z18): the header's badge. It comes
// with the quota's read, so the badge and `LimitMeter` share one request; 0 while it loads, fails
// or nobody is signed in.
export function useUnseenCount(enabled = true): number {
  const unseen = useFittingQuota(enabled).data?.unseen ?? 0;
  // A quota cached before a sign-out is not the visitor's.
  return enabled ? unseen : 0;
}

// The cached count changed at once, before the api's: the push of a result (+1) or the history
// opened (0). Nothing cached, nothing changes: the next read brings the real count.
export function setUnseenCount(queryClient: QueryClient, next: (unseen: number) => number): void {
  queryClient.setQueryData<FittingQuota>(fittingKeys.quota, (quota) =>
    quota ? { ...quota, unseen: Math.max(0, next(quota.unseen)) } : quota,
  );
}

function cachedUnseen(queryClient: QueryClient): number {
  return queryClient.getQueryData<FittingQuota>(fittingKeys.quota)?.unseen ?? 0;
}

// A failed write is logged, not shown (plan §4.6): the badge stays until the next opening.
function logged(failure: unknown) {
  reportFailure(failure);
}

// A result on screen (spec 0024 AC30): each completed fitting id is marked seen once, with no
// retry. A fitting's answer does not say whether it was seen, so the count is not taken down by
// one: while the badge shows any, or a read counted before the write is on its way (the push's),
// the quota is read again for the real count.
export function useMarkFittingSeen(id: string | null): void {
  const queryClient = useQueryClient();
  const markedRef = useRef(new Set<string>());
  useEffect(() => {
    if (id === null || markedRef.current.has(id)) return;
    markedRef.current.add(id);
    markFittingSeen(id).then(() => {
      if (
        cachedUnseen(queryClient) > 0 ||
        queryClient.isFetching({ queryKey: fittingKeys.quota }) > 0
      ) {
        void queryClient.invalidateQueries({ queryKey: fittingKeys.quota });
      }
    }, logged);
  }, [id, queryClient]);
}

// The history shown (Z18): every completed result is seen, the badge goes at once. Each time the
// page shows: Next keeps a left page hidden in an `<Activity>` (spec 0023 Y22), which runs effects'
// cleanups on hiding and their setups again on showing, so a return to it marks again; the write
// is idempotent. A
// read of the quota on its way could bring the old count back, so it is cancelled first, and the
// quota is read again once the write ends either way (a cancelled first read is not restarted by
// itself, and the page's meter needs it).
export function useMarkAllFittingsSeen(enabled: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      await queryClient.cancelQueries({ queryKey: fittingKeys.quota });
      setUnseenCount(queryClient, () => 0);
      try {
        await markAllFittingsSeen();
      } catch (failure) {
        logged(failure);
      }
      void queryClient.invalidateQueries({ queryKey: fittingKeys.quota });
    })();
  }, [enabled, queryClient]);
}
