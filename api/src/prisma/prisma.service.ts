import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// The one database client of the process. Connects lazily (on the first query), so the api starts
// even while Postgres is still coming up; /health/ready reports whether it is reachable. Its pool is
// bounded in size, in the wait for a connection and in a statement's time, and every transaction
// waits for a connection and runs as long as one statement may (spec 0014 plan §2.7, O59).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    const connectionTimeout = config.get('DATABASE_CONNECTION_TIMEOUT_MS', { infer: true });
    const statementTimeout = config.get('DATABASE_STATEMENT_TIMEOUT_MS', { infer: true });
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        max: config.get('DATABASE_POOL_MAX', { infer: true }),
        statement_timeout: statementTimeout,
        connectionTimeoutMillis: connectionTimeout,
      }),
      transactionOptions: { maxWait: connectionTimeout, timeout: statementTimeout },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

// The seed's client, provided as PrismaService by SeedModule: the same database without the pool's
// limits, as loading the catalog may run longer than a request's statement (plan §2.7). The
// migrations connect on their own (prisma.config.ts).
@Injectable()
export class UnlimitedPrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
