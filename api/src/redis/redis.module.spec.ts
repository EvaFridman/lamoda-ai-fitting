import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { REDIS, RedisModule } from './redis.module.js';

const created = vi.hoisted(() => [] as { url: string; options: Record<string, unknown> }[]);

// The real client would try to connect; only the options the module gives it matter here.
vi.mock('ioredis', () => ({
  Redis: class {
    constructor(url: string, options: Record<string, unknown>) {
      created.push({ url, options });
    }
    on = vi.fn();
    quit = vi.fn().mockResolvedValue('OK');
  },
}));

describe('RedisModule', () => {
  afterEach(() => {
    created.length = 0;
  });

  async function boot() {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ REDIS_URL: 'redis://redis.test:6379' })],
        }),
        RedisModule,
      ],
    }).compile();
  }

  it('creates the client with a 1 s command timeout and 3 retries per request (F28)', async () => {
    const moduleRef = await boot();

    expect(moduleRef.get(REDIS)).toBeDefined();
    expect(created).toHaveLength(1);
    expect(created[0]?.url).toBe('redis://redis.test:6379');
    expect(created[0]?.options).toMatchObject({ commandTimeout: 1000, maxRetriesPerRequest: 3 });
    await moduleRef.close();
  });

  it('quits the client when the module is destroyed', async () => {
    const moduleRef = await boot();
    const client = moduleRef.get<{ quit: ReturnType<typeof vi.fn> }>(REDIS);

    await moduleRef.close();

    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});
