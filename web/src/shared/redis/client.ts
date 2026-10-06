import 'server-only';

import { Redis } from 'ioredis';

import { getServerEnv } from '@/shared/config';

// One Redis client per server process, created on first use and connected on its first command:
// nothing here runs during `next build`. What web keeps in Redis is decided by the features that
// need it (e.g. sessions in spec 0002-auth).
let client: Redis | undefined;

export function getRedis(): Redis {
  client ??= new Redis(getServerEnv().REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
  return client;
}
