import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';

interface Waiter {
  resolve: () => void;
  timer: NodeJS.Timeout;
}

// How many of the filter counts' queries run at once in the process: half the database pool, at
// least one (spec 0014 O62). A cache miss runs 7 queries; without this, a client sending new
// filters could hold the whole pool and every other route would wait for a connection. A query
// that waits for a slot longer than DATABASE_CONNECTION_TIMEOUT_MS answers 503, as one that waits
// for a connection does.
@Injectable()
export class FacetQuerySlots {
  private readonly size: number;
  private readonly maxWaitMs: number;
  private active = 0;
  private readonly waiting: Waiter[] = [];

  constructor(config: ConfigService<Env, true>) {
    this.size = Math.max(1, Math.floor(config.get('DATABASE_POOL_MAX', { infer: true }) / 2));
    this.maxWaitMs = config.get('DATABASE_CONNECTION_TIMEOUT_MS', { infer: true });
  }

  // `signal`: the caller no longer needs the result (another query of its request failed), so a
  // query still waiting for a slot leaves the queue and never runs.
  async run<T>(query: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    await this.acquire(signal);
    try {
      // A slot handed over just before the abort: give it back without running.
      signal?.throwIfAborted();
      return await query();
    } finally {
      this.release();
    }
  }

  private acquire(signal: AbortSignal | undefined): Promise<void> {
    if (this.active < this.size) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const leave = (error: unknown) => {
        this.waiting.splice(this.waiting.indexOf(waiter), 1);
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      };
      const onAbort = () => {
        clearTimeout(waiter.timer);
        leave(signal?.reason);
      };
      const waiter: Waiter = {
        resolve: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
        timer: setTimeout(() => {
          leave(
            new AppException(
              'SERVICE_UNAVAILABLE',
              'Too many filter counts at once, try again later',
            ),
          );
        }, this.maxWaitMs),
      };
      this.waiting.push(waiter);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  // A freed slot passes straight to the first waiter, so `active` stays.
  private release(): void {
    const next = this.waiting.shift();
    if (next === undefined) {
      this.active -= 1;
      return;
    }
    clearTimeout(next.timer);
    next.resolve();
  }
}
