import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

import { setUpBucket } from '../../src/storage/dev-setup.js';
import { createS3Client, type StorageSettings } from '../../src/storage/s3-client.provider.js';

// Vitest globalSetup of the `database` project (vitest.config.ts), next to database.ts: one
// throwaway SeaweedFS for the run (spec 0011 plan §8), with the rules of the local emulator
// (dev-setup.ts). Never the development emulator, and never skipped: without Docker the run fails.

const S3_PORT = 8333;
const BUCKET = 'ai-fitting-test';
// SeaweedFS creates the bucket a moment after its S3 port answers.
const BUCKET_TIMEOUT_MS = 30_000;

// The image of the compose `s3` service, read from the file so a version bump cannot leave the
// tests on the old one.
async function seaweedImage(apiRoot: string): Promise<string> {
  const compose = await readFile(join(apiRoot, '..', 'docker-compose.yml'), 'utf8');
  const image = /^\s*image:\s*(chrislusf\/seaweedfs:\S+)\s*$/m.exec(compose)?.[1];
  if (image === undefined) {
    throw new Error('No `image: chrislusf/seaweedfs:<tag>` line found in docker-compose.yml.');
  }
  return image;
}

declare module 'vitest' {
  export interface ProvidedContext {
    // The emulator's address, bucket and keys (random per run): test-storage.ts builds the
    // storage settings from them.
    storage: Omit<StorageSettings, 'publicEndpoint' | 'signedUrlTtlSeconds'>;
  }
}

async function waitForBucket(settings: StorageSettings): Promise<void> {
  const client = createS3Client(settings, settings.endpoint);
  const deadline = Date.now() + BUCKET_TIMEOUT_MS;
  try {
    for (;;) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: settings.bucket }));
        await setUpBucket(client, settings.bucket);
        return;
      } catch (error) {
        if (Date.now() > deadline) {
          throw new Error(`The test bucket did not appear within ${BUCKET_TIMEOUT_MS} ms.`, {
            cause: error,
          });
        }
        await delay(200);
      }
    }
  } finally {
    client.destroy();
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const image = await seaweedImage(project.config.root);
  // No Ryuk (spec 0002 C24, as in database.ts): the teardown below removes the container; a killed
  // run leaves it behind (label `org.testcontainers=true`).
  process.env['TESTCONTAINERS_RYUK_DISABLED'] = 'true';
  // The published port is reachable from the network while the run lasts, so the keys are random.
  const accessKeyId = randomBytes(10).toString('hex');
  const secretAccessKey = randomBytes(20).toString('hex');
  let container: StartedTestContainer;
  try {
    // The command of the compose service: one process, the bucket from S3_BUCKET, an admin user
    // from the AWS_* keys, no telemetry, admin UI or WebDAV, no bucket created by a write.
    container = await new GenericContainer(image)
      .withCommand([
        'mini',
        '-dir=/data',
        '-master.telemetry=false',
        '-admin.ui=false',
        '-webdav=false',
        '-s3.autoCreateBucket=false',
      ])
      .withEnvironment({
        AWS_ACCESS_KEY_ID: accessKeyId,
        AWS_SECRET_ACCESS_KEY: secretAccessKey,
        S3_BUCKET: BUCKET,
      })
      .withExposedPorts(S3_PORT)
      .withWaitStrategy(Wait.forHttp('/healthz', S3_PORT))
      .start();
  } catch (error) {
    throw new Error(
      'The database tests (api/test/database) could not start a SeaweedFS container. ' +
        'Is Docker running? Start Docker and run the tests again.',
      { cause: error },
    );
  }

  const storage = {
    endpoint: `http://${container.getHost()}:${container.getMappedPort(S3_PORT)}`,
    region: 'ru-1',
    bucket: BUCKET,
    accessKeyId,
    secretAccessKey,
  };
  try {
    await waitForBucket({ ...storage, publicEndpoint: storage.endpoint, signedUrlTtlSeconds: 900 });
  } catch (error) {
    await container.stop();
    throw error;
  }

  project.provide('storage', storage);

  return async () => {
    await container.stop();
  };
}
