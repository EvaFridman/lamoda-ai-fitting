import { Global, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Connection } from '@temporalio/client';

import type { Env } from '../config/env.js';

// Client for starting and querying workflows. `Connection.lazy` connects on the first call, so the
// api starts even while Temporal is down; /health/ready reports it.
@Global()
@Module({
  providers: [
    {
      provide: Connection,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Connection =>
        Connection.lazy({ address: config.get('TEMPORAL_ADDRESS', { infer: true }) }),
    },
    {
      provide: Client,
      inject: [Connection, ConfigService],
      useFactory: (connection: Connection, config: ConfigService<Env, true>): Client =>
        new Client({ connection, namespace: config.get('TEMPORAL_NAMESPACE', { infer: true }) }),
    },
  ],
  exports: [Connection, Client],
})
export class TemporalClientModule implements OnModuleDestroy {
  constructor(private readonly connection: Connection) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection.close();
  }
}
