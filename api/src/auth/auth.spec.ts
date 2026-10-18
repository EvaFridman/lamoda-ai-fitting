import { describe, expect, it, type Mock, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { type AuthEnv, type AuthLogger, createAuth } from './auth.js';

const ENV: AuthEnv = {
  WEB_ORIGIN: 'http://localhost:3001',
  BETTER_AUTH_SECRET: 'unit-test-secret-0123456789abcdef0123456789',
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
  AUTH_FAKE_OIDC_URL: '',
  AUTH_FAKE_OIDC_PUBLIC_URL: '',
};

async function betterAuthLogger() {
  const logger: { [K in keyof AuthLogger]: Mock<AuthLogger[K]> } = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const auth = createAuth(ENV, {} as PrismaClient, logger);
  const context = await auth.$context;
  return { logger, log: context.logger };
}

describe('createAuth logger adapter', () => {
  it('passes a string message on with its arguments', async () => {
    const { logger, log } = await betterAuthLogger();

    log.error('Failed to sign in', { reason: 'x' });

    expect(logger.error).toHaveBeenCalledWith(
      { args: [expect.anything()] },
      expect.stringContaining('Failed to sign in'),
    );
  });

  it('logs an error passed as the message as "Better Auth error" in err', async () => {
    const { logger, log } = await betterAuthLogger();
    const error = new Error('insert into users failed: secret@example.com');

    log.error(error as unknown as string);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [fields, message] = logger.error.mock.calls[0] as [Record<string, unknown>, string];
    expect(message).toBe('Better Auth error');
    expect(fields).toHaveProperty('args', []);
    expect(fields).toHaveProperty('err');
  });
});
