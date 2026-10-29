import type { PendingFitting } from '@/features/start-fitting';

// A start the window shows from the click, before the api answers (spec 0024 AC19, plan §4.1).
export interface StartIntent {
  kind: PendingFitting['kind'];
  items: PendingFitting['items'];
  // The photo it uses, for the wait's frame and for keeping a one-time photo while it is sent.
  photoId: string | null;
  // A colour over the shown result (boards 7.2, 8.2): its wait is over the picture; else the wait
  // of its own (board 6), the screen it came from kept mounted under it.
  overResult: boolean;
}

export interface Starting extends StartIntent {
  // The click's time: the progress's origin, kept once the api answers.
  at: number;
}

// A start clicked now.
export function startingNow(intent: StartIntent): Starting {
  return { ...intent, at: Date.now() };
}

// The wait's fitting before the api answers: no estimate yet, so the default one.
export function pendingFitting(starting: Starting): PendingFitting {
  return {
    kind: starting.kind,
    items: starting.items,
    createdAt: new Date(starting.at).toISOString(),
    estimatedSeconds: null,
  };
}
