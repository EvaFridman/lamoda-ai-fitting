'use client';

import { useEffect, useRef } from 'react';

import {
  connectRealtime,
  disconnectRealtime,
  onRealtimeEvent,
  type RealtimeEvent,
} from './connection';

// Keeps the tab's connection in line with the session: a user's id opens it (another user's id
// opens it again, for that user), `null` closes it, `undefined` (the session loads, or its read
// failed, so it may still be there) leaves it as it is. Mounted once, by the header.
export function useRealtimeConnection(userId: string | null | undefined): void {
  useEffect(() => {
    if (userId === null) disconnectRealtime();
    else if (userId !== undefined) connectRealtime(userId);
  }, [userId]);

  useEffect(() => disconnectRealtime, []);
}

// Calls `listener` with each push of `event` to this tab (the latest `listener` given). `event`
// is a module constant: a new one per render subscribes again.
export function useRealtimeEvent<Value>(
  event: RealtimeEvent<Value>,
  listener: (value: Value) => void,
): void {
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  });
  useEffect(() => onRealtimeEvent(event, (value) => listenerRef.current(value)), [event]);
}
