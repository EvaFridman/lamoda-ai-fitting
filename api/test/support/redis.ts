import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Redis } from 'ioredis';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

// A throwaway Redis for one spec file under test/database/ (spec 0018 AC6, AC7), started in its
// `beforeAll`: unlike the database, the bucket and Temporal, a spec sets this one's memory limit, so
// files do not share it. The command of the compose services: nothing on disk and the policy of
// `redis` (`noeviction`) or `redis-cache` (`allkeys-lru`). No memory limit at start: Redis' own
// memory differs between versions, so a spec sets one above what it uses (`limitMemory`).

const REDIS_PORT = 6379;

export interface TestRedis {
  // redis://host:port, for REDIS_URL or REDIS_CACHE_URL.
  url: string;
  // A client of the spec's own, for arranging and checking keys.
  client: Redis;
  // Sets `maxmemory` to the memory Redis uses now plus `headroomBytes`; returns the limit.
  limitMemory: (headroomBytes: number) => Promise<number>;
  stop: () => Promise<void>;
}

// The image of the compose `redis` services, read from the file so a version bump cannot leave the
// tests on the old one.
async function redisImage(): Promise<string> {
  const compose = await readFile(
    join(import.meta.dirname, '..', '..', '..', 'docker-compose.yml'),
    'utf8',
  );
  const image = /^\s*image:\s*(redis:\S+)\s*$/m.exec(compose)?.[1];
  if (image === undefined) {
    throw new Error('No `image: redis:<tag>` line found in docker-compose.yml.');
  }
  return image;
}

export async function usedMemory(client: Redis): Promise<number> {
  const info = await client.info('memory');
  const used = /^used_memory:(\d+)\r?$/m.exec(info)?.[1];
  if (used === undefined) throw new Error('INFO memory has no used_memory.');
  return Number(used);
}

export async function startTestRedis(policy: 'noeviction' | 'allkeys-lru'): Promise<TestRedis> {
  const image = await redisImage();
  // No Ryuk (spec 0002 C24, as in database.ts): `stop` removes the container; a killed run leaves
  // it behind (label `org.testcontainers=true`).
  process.env['TESTCONTAINERS_RYUK_DISABLED'] = 'true';
  let container: StartedTestContainer;
  try {
    container = await new GenericContainer(image)
      .withCommand([
        'redis-server',
        '--save',
        '',
        '--appendonly',
        'no',
        '--maxmemory-policy',
        policy,
      ])
      .withExposedPorts(REDIS_PORT)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();
  } catch (error) {
    throw new Error(
      'The database tests (api/test/database) could not start a Redis container. ' +
        'Is Docker running? Start Docker and run the tests again.',
      { cause: error },
    );
  }
  const url = `redis://${container.getHost()}:${container.getMappedPort(REDIS_PORT)}`;
  const client = new Redis(url, { maxRetriesPerRequest: 1 });
  return {
    url,
    client,
    limitMemory: async (headroomBytes) => {
      const limit = (await usedMemory(client)) + headroomBytes;
      await client.config('SET', 'maxmemory', String(limit));
      return limit;
    },
    stop: async () => {
      try {
        await client.quit();
      } finally {
        await container.stop();
      }
    },
  };
}
