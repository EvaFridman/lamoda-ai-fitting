import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Connection } from '@temporalio/client';

import { FileDeletion } from './file-deletion.js';
import { TEMPORAL_SETTINGS, type TemporalSettings, temporalSettings } from './temporal-settings.js';
import { WorkflowStarter } from './workflow-starter.js';

// Client for starting and querying workflows. `Connection.lazy` connects on the first call, so the
// api starts even while Temporal is down (/health/ready checks Temporal on a connection of its own,
// health/dependency-checks.ts). No gRPC retries of the SDK (`interceptors: []`): a retry still
// pending when the connection closes would throw out of its timer. Workflows are started through
// WorkflowStarter, which retries within a bounded time instead.
@Global()
@Module({
  providers: [
    { provide: TEMPORAL_SETTINGS, inject: [ConfigService], useFactory: temporalSettings },
    {
      provide: Connection,
      inject: [TEMPORAL_SETTINGS],
      useFactory: (settings: TemporalSettings): Connection =>
        Connection.lazy({ address: settings.address, interceptors: [] }),
    },
    {
      provide: Client,
      inject: [Connection, TEMPORAL_SETTINGS],
      useFactory: (connection: Connection, settings: TemporalSettings): Client =>
        new Client({ connection, namespace: settings.namespace }),
    },
    WorkflowStarter,
    FileDeletion,
  ],
  exports: [Connection, Client, WorkflowStarter, FileDeletion],
})
export class TemporalClientModule implements OnApplicationShutdown {
  constructor(
    private readonly connection: Connection,
    private readonly starter: WorkflowStarter,
  ) {}

  // After the HTTP server has closed (onModuleDestroy runs while it still takes requests, and a
  // delete then would lose its start). The starts in progress end first (each within
  // START_TIMEOUT_MS): a call left on the closed channel would throw "Channel has been shut down".
  async onApplicationShutdown(): Promise<void> {
    await this.starter.drain();
    await this.connection.close();
  }
}
