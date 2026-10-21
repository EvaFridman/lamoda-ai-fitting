// One deadline over a whole call (spec 0019 A45): the timeout's signal, joined with the caller's
// own (a cancelled activity) when there is one. Both reasons stay apart: a timeout's is a
// DOMException named TimeoutError, a cancellation's an AbortError.
export function withDeadline(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

// Whether an error is the abort of the signal, and which kind. Decided by the signal first: a
// Temporal activity's cancellation aborts its signal with the SDK's CancelledFailure, whose name is
// neither of the two, and fetch rejects with that reason (files.activities.ts does the same).
export function abortKind(error: unknown, signal?: AbortSignal): 'timeout' | 'aborted' | null {
  if (signal?.aborted) return isTimeoutReason(signal.reason) ? 'timeout' : 'aborted';
  if (!(error instanceof Error)) return null;
  if (error.name === 'TimeoutError') return 'timeout';
  if (error.name === 'AbortError') return 'aborted';
  return null;
}

function isTimeoutReason(reason: unknown): boolean {
  return reason instanceof Error && reason.name === 'TimeoutError';
}

// Waits `ms`, or rejects with the signal's reason as soon as it aborts.
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}
