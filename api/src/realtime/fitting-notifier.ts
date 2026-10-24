import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import type { Env } from '../config/env.js';
import { FITTING_EVENTS_CHANNEL, parseFittingFinished } from './fitting-events.js';
import { RealtimeGateway } from './realtime.gateway.js';

// At most one warning a minute about connection errors, and one about dropped messages.
const WARN_INTERVAL_MS = 60_000;

// Pushes a finished fitting to its user's sockets (spec 0019 plan §6, A44): subscribes to the
// channel `fitting-events` of the counters' Redis, where the worker's `notify` publishes, and
// hands each message to the gateway. A subscriber needs a connection of its own, without the
// shared clients' command timeout (redis.module.ts). The api starts and serves with this Redis
// down: ioredis reconnects and subscribes again by itself, and a message published meanwhile is
// lost, which costs nothing (the waiting screen polls).
@Injectable()
export class FittingNotifier implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FittingNotifier.name);
  private subscriber: Redis | undefined;
  // When each kind of warning was last logged, so a flood of one never hides the other.
  private readonly warnedAt = new Map<'connection' | 'message', number>();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly gateway: RealtimeGateway,
  ) {}

  onModuleInit(): void {
    const subscriber = new Redis(this.config.get('REDIS_URL', { infer: true }), {
      // SUBSCRIBE waits in the offline queue until Redis answers, however long that takes.
      maxRetriesPerRequest: null,
    });
    subscriber.on('error', (error: Error) => {
      this.warn('connection', `connection error: ${error.message}`);
    });
    subscriber.on('message', (channel: string, raw: string) => {
      this.receive(channel, raw);
    });
    // Not awaited: the api's start does not wait for this Redis.
    subscriber.subscribe(FITTING_EVENTS_CHANNEL).catch((error: unknown) => {
      this.warn(
        'connection',
        `subscribe failed:${error instanceof Error ? error.message : String(error)}`,
      );
    });
    this.subscriber = subscriber;
  }

  onModuleDestroy(): void {
    this.subscriber?.disconnect();
  }

  private receive(channel: string, raw: string): void {
    if (channel !== FITTING_EVENTS_CHANNEL) {
      return;
    }
    const message = parseFittingFinished(raw);
    if (message === null) {
      // The content is not logged: it came from outside this process.
      this.warn('message', 'dropped a message of an unknown shape');
      return;
    }
    const { userId, ...push } = message;
    this.gateway.pushFittingFinished(userId, push);
  }

  private warn(kind: 'connection' | 'message', msg: string): void {
    const time = Date.now();
    const last = this.warnedAt.get(kind);
    if (last !== undefined && time - last < WARN_INTERVAL_MS) {
      return;
    }
    this.warnedAt.set(kind, time);
    this.logger.warn(msg);
  }
}
