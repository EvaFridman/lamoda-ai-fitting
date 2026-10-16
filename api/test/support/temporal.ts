import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

// Vitest globalSetup of the `database` project (vitest.config.ts), next to database.ts and
// storage.ts: one throwaway Temporal for the run (spec 0011 M16), the dev server of the compose
// service. Never the development Temporal, and never skipped: without Docker the run fails. Test
// files share it; each uses a task queue of its own (test-temporal.ts).

const GRPC_PORT = 7233;

// The image of the compose `temporal` service, read from the file so a version bump cannot leave
// the tests on the old one.
async function temporalImage(apiRoot: string): Promise<string> {
  const compose = await readFile(join(apiRoot, '..', 'docker-compose.yml'), 'utf8');
  const image = /^\s*image:\s*(temporalio\/temporal:\S+)\s*$/m.exec(compose)?.[1];
  if (image === undefined) {
    throw new Error('No `image: temporalio/temporal:<tag>` line found in docker-compose.yml.');
  }
  return image;
}

declare module 'vitest' {
  export interface ProvidedContext {
    // The throwaway server's gRPC address, `host:port`.
    temporalAddress: string;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const image = await temporalImage(project.config.root);
  // No Ryuk (spec 0002 C24, as in database.ts): the teardown below removes the container; a killed
  // run leaves it behind (label `org.testcontainers=true`).
  process.env['TESTCONTAINERS_RYUK_DISABLED'] = 'true';
  let container: StartedTestContainer;
  try {
    // The compose service's command without its UI, history in memory. The published port is
    // reachable from the network while the run lasts; it holds only the tests' workflows.
    container = await new GenericContainer(image)
      .withCommand(['server', 'start-dev', '--ip=0.0.0.0', '--headless'])
      .withExposedPorts(GRPC_PORT)
      .withWaitStrategy(
        Wait.forSuccessfulCommand(
          `temporal operator cluster health --address 127.0.0.1:${GRPC_PORT}`,
        ),
      )
      .start();
  } catch (error) {
    throw new Error(
      'The database tests (api/test/database) could not start a Temporal container. ' +
        'Is Docker running? Start Docker and run the tests again.',
      { cause: error },
    );
  }

  project.provide(
    'temporalAddress',
    `${container.getHost()}:${container.getMappedPort(GRPC_PORT)}`,
  );

  return async () => {
    await container.stop();
  };
}
