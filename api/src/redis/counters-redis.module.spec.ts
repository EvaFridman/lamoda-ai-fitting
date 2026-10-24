import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { CountersRedisModule, REDIS } from './redis.module.js';

describe('CountersRedisModule', () => {
  async function build() {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ REDIS_URL: 'redis://127.0.0.1:1' })],
        }),
        CountersRedisModule,
      ],
    }).compile();
  }

  it('provides the counters client alone', async () => {
    const moduleRef = await build();

    expect(moduleRef.get(REDIS, { strict: false })).toBeInstanceOf(Redis);
    await moduleRef.close();
  });

  it('closes without throwing while Redis is unreachable, dropping the client', async () => {
    const moduleRef = await build();
    const redis = moduleRef.get<Redis>(REDIS, { strict: false });
    const disconnect = vi.spyOn(redis, 'disconnect');
    vi.spyOn(redis, 'quit').mockRejectedValue(new Error('Connection is closed.'));

    await expect(moduleRef.close()).resolves.toBeUndefined();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
