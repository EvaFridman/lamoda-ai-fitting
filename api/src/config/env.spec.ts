import { describe, expect, it } from 'vitest';

import {
  assertServerEnv,
  assertWorkerEnv,
  type ServerEnv,
  serverEnvWarnings,
  validateEnv,
  workerEnvWarnings,
} from './env.js';

const valid = {
  WEB_ORIGIN: 'http://localhost:3001',
  DATABASE_URL: 'postgresql://u:p@db:5432/app',
  REDIS_URL: 'redis://redis:6379',
  REDIS_CACHE_URL: 'redis://redis-cache:6379',
  TEMPORAL_ADDRESS: 'temporal:7233',
  MEDIA_BASE_URL: 'http://localhost:3001/media/',
  S3_ENDPOINT: 'http://s3:8333',
  S3_BUCKET: 'lamoda-ai-fitting',
  S3_ACCESS_KEY_ID: 'access-key-id',
  S3_SECRET_ACCESS_KEY: 'secret-access-key',
};

function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('validateEnv', () => {
  it.each(['', 'short', 'a'.repeat(40), 'with space'])(
    'ignores a leftover ADMIN_API_TOKEN %j: it is neither read nor checked',
    (token) => {
      const env = validateEnv({ ...valid, ADMIN_API_TOKEN: token });

      expect(env).not.toHaveProperty('ADMIN_API_TOKEN');
    },
  );

  it.each(['http://localhost:3001', 'https://lamoda-ai-fitting.ru'])(
    'accepts WEB_ORIGIN %s, an origin as a browser sends it',
    (origin) => {
      expect(validateEnv({ ...valid, WEB_ORIGIN: origin }).WEB_ORIGIN).toBe(origin);
    },
  );

  it.each([
    'not a url',
    '',
    'https://host/',
    'https://host:443',
    'http://host:80',
    'https://host/path',
    'https://host?x=1',
  ])('refuses WEB_ORIGIN %s, which is not its own origin, naming the variable', (origin) => {
    expect(thrownMessage(() => validateEnv({ ...valid, WEB_ORIGIN: origin }))).toMatch(
      /WEB_ORIGIN/,
    );
  });

  it.each(['redis://redis-cache:6379', 'rediss://cache.example.ru:6380'])(
    'accepts REDIS_CACHE_URL %s',
    (url) => {
      expect(validateEnv({ ...valid, REDIS_CACHE_URL: url }).REDIS_CACHE_URL).toBe(url);
    },
  );

  it.each(['', 'not a url', 'http://redis-cache:6379', 'redis-cache:6379'])(
    'refuses REDIS_CACHE_URL %j, naming the variable',
    (url) => {
      expect(thrownMessage(() => validateEnv({ ...valid, REDIS_CACHE_URL: url }))).toMatch(
        /REDIS_CACHE_URL/,
      );
    },
  );

  it('refuses a missing REDIS_CACHE_URL, naming the variable', () => {
    const { REDIS_CACHE_URL: _omitted, ...without } = valid;

    expect(thrownMessage(() => validateEnv(without))).toMatch(/REDIS_CACHE_URL/);
  });

  it('defaults PROXY_SECRET to an empty string', () => {
    expect(validateEnv(valid).PROXY_SECRET).toBe('');
  });

  it.each(['', 'a'.repeat(32), 'ab12'.repeat(16)])('accepts PROXY_SECRET %j', (secret) => {
    expect(validateEnv({ ...valid, PROXY_SECRET: secret }).PROXY_SECRET).toBe(secret);
  });

  it.each([
    ['31 characters', 'a'.repeat(31)],
    ['a space inside', `${'a'.repeat(20)} ${'a'.repeat(19)}`],
    ['a leading space', ` ${'a'.repeat(39)}`],
    ['a trailing space', `${'a'.repeat(39)} `],
    ['a tab', `${'a'.repeat(39)}\t`],
    ['a dollar sign', `${'a'.repeat(39)}$`],
    ['a double quote', `${'a'.repeat(39)}"`],
    ['a semicolon', `${'a'.repeat(39)};`],
    ['a hyphen', `${'a'.repeat(20)}-${'a'.repeat(19)}`],
    ['a backtick', `${'a'.repeat(39)}\``],
  ])('refuses PROXY_SECRET with %s, naming the variable but not the value', (_name, secret) => {
    const message = thrownMessage(() => validateEnv({ ...valid, PROXY_SECRET: secret }));

    expect(message).toMatch(/PROXY_SECRET/);
    expect(message).not.toContain(secret);
  });

  it('does not compare PROXY_SECRET and PROXY_SECRET_NEXT with a leftover ADMIN_API_TOKEN', () => {
    const shared = 'sharedvalue0123456789abcdefxyz01';

    const env = validateEnv({
      ...valid,
      PROXY_SECRET: shared,
      PROXY_SECRET_NEXT: shared,
      ADMIN_API_TOKEN: shared,
    });

    expect(env.PROXY_SECRET).toBe(shared);
    expect(env.PROXY_SECRET_NEXT).toBe(shared);
  });

  it('defaults REQUEST_TIMEOUT_MS to 10000', () => {
    expect(validateEnv(valid).REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  // The smallest value the database timeouts (at least 1 ms each) allow is 3.
  it.each([
    ['3', 3],
    ['30000', 30_000],
  ])('accepts REQUEST_TIMEOUT_MS %s', (value, expected) => {
    expect(
      validateEnv({
        ...valid,
        REQUEST_TIMEOUT_MS: value,
        DATABASE_STATEMENT_TIMEOUT_MS: '1',
        DATABASE_CONNECTION_TIMEOUT_MS: '1',
      }).REQUEST_TIMEOUT_MS,
    ).toBe(expected);
  });

  it.each(['30001', '0', '-1', '1.5', 'abc'])(
    'refuses REQUEST_TIMEOUT_MS %j, naming the variable',
    (value) => {
      const message = thrownMessage(() => validateEnv({ ...valid, REQUEST_TIMEOUT_MS: value }));

      expect(message).toMatch(/REQUEST_TIMEOUT_MS/);
    },
  );

  it('defaults FACETS_CACHE_TTL_SECONDS to 60', () => {
    expect(validateEnv(valid).FACETS_CACHE_TTL_SECONDS).toBe(60);
  });

  it.each([
    ['1', 1],
    ['3600', 3600],
  ])('accepts FACETS_CACHE_TTL_SECONDS %s', (value, expected) => {
    expect(
      validateEnv({ ...valid, FACETS_CACHE_TTL_SECONDS: value }).FACETS_CACHE_TTL_SECONDS,
    ).toBe(expected);
  });

  it.each(['0', '3601', '1.5', 'abc'])(
    'refuses FACETS_CACHE_TTL_SECONDS %j, naming the variable',
    (value) => {
      const message = thrownMessage(() =>
        validateEnv({ ...valid, FACETS_CACHE_TTL_SECONDS: value }),
      );

      expect(message).toMatch(/FACETS_CACHE_TTL_SECONDS/);
    },
  );

  it('defaults PROXY_SECRET_NEXT to an empty string', () => {
    expect(validateEnv(valid).PROXY_SECRET_NEXT).toBe('');
  });

  it.each(['', 'a'.repeat(32), 'ab12'.repeat(16)])('accepts PROXY_SECRET_NEXT %j', (secret) => {
    expect(validateEnv({ ...valid, PROXY_SECRET_NEXT: secret }).PROXY_SECRET_NEXT).toBe(secret);
  });

  it.each([
    ['31 characters', 'a'.repeat(31)],
    ['a space inside', `${'a'.repeat(20)} ${'a'.repeat(19)}`],
    ['a trailing space', `${'a'.repeat(39)} `],
    ['a dollar sign', `${'a'.repeat(39)}$`],
    ['a double quote', `${'a'.repeat(39)}"`],
    ['a semicolon', `${'a'.repeat(39)};`],
    ['a hyphen', `${'a'.repeat(20)}-${'a'.repeat(19)}`],
  ])(
    'refuses PROXY_SECRET_NEXT with %s, naming the variable but not the value',
    (_name, secret) => {
      const message = thrownMessage(() => validateEnv({ ...valid, PROXY_SECRET_NEXT: secret }));

      expect(message).toMatch(/PROXY_SECRET_NEXT/);
      expect(message).not.toContain(secret);
    },
  );

  it.each([
    ['PROXY_SECRET empty', '', 'n'.repeat(32)],
    ['both set and different', 'p'.repeat(32), 'n'.repeat(32)],
    ['both equal', 'p'.repeat(32), 'p'.repeat(32)],
    ['NEXT empty', 'p'.repeat(32), ''],
  ])('accepts PROXY_SECRET_NEXT with %s', (_name, proxy, next) => {
    const env = validateEnv({
      ...valid,
      PROXY_SECRET: proxy,
      PROXY_SECRET_NEXT: next,
    });

    expect(env.PROXY_SECRET).toBe(proxy);
    expect(env.PROXY_SECRET_NEXT).toBe(next);
  });

  it('accepts production with an empty PROXY_SECRET (the temporal-worker has none)', () => {
    const env = validateEnv({ ...valid, NODE_ENV: 'production', PROXY_SECRET: '' });

    expect(env.NODE_ENV).toBe('production');
    expect(env.PROXY_SECRET).toBe('');
  });

  it.each(['http://localhost:3001/media/', 'https://example.ru/media/'])(
    'accepts MEDIA_BASE_URL %s',
    (url) => {
      expect(validateEnv({ ...valid, MEDIA_BASE_URL: url }).MEDIA_BASE_URL).toBe(url);
    },
  );

  it('refuses a missing MEDIA_BASE_URL, naming the variable', () => {
    const { MEDIA_BASE_URL: _omitted, ...without } = valid;

    expect(() => validateEnv(without)).toThrow(/MEDIA_BASE_URL/);
  });

  it.each(['ftp://example.ru/media/', 'not a url', ''])('refuses MEDIA_BASE_URL %j', (url) => {
    expect(() => validateEnv({ ...valid, MEDIA_BASE_URL: url })).toThrow(/MEDIA_BASE_URL/);
  });
});

describe('validateEnv database pool and timeouts', () => {
  it('defaults to a pool of 10, a 5000 ms statement and a 2000 ms wait for a connection', () => {
    const env = validateEnv(valid);

    expect(env.DATABASE_POOL_MAX).toBe(10);
    expect(env.DATABASE_STATEMENT_TIMEOUT_MS).toBe(5000);
    expect(env.DATABASE_CONNECTION_TIMEOUT_MS).toBe(2000);
  });

  it.each([
    ['1', 1],
    ['50', 50],
  ])('accepts DATABASE_POOL_MAX %s', (value, expected) => {
    expect(validateEnv({ ...valid, DATABASE_POOL_MAX: value }).DATABASE_POOL_MAX).toBe(expected);
  });

  it.each(['0', '51', '-1', '1.5', 'abc'])(
    'refuses DATABASE_POOL_MAX %j, naming the variable',
    (value) => {
      expect(thrownMessage(() => validateEnv({ ...valid, DATABASE_POOL_MAX: value }))).toMatch(
        /DATABASE_POOL_MAX/,
      );
    },
  );

  it.each(['DATABASE_STATEMENT_TIMEOUT_MS', 'DATABASE_CONNECTION_TIMEOUT_MS'])(
    'refuses %s that is zero, negative or not an integer, naming the variable',
    (name) => {
      for (const value of ['0', '-1', '1.5', 'abc']) {
        expect(thrownMessage(() => validateEnv({ ...valid, [name]: value }))).toMatch(
          new RegExp(name),
        );
      }
    },
  );

  it('accepts the two timeouts one millisecond under REQUEST_TIMEOUT_MS', () => {
    const env = validateEnv({
      ...valid,
      REQUEST_TIMEOUT_MS: '1000',
      DATABASE_STATEMENT_TIMEOUT_MS: '600',
      DATABASE_CONNECTION_TIMEOUT_MS: '399',
    });

    expect(env.REQUEST_TIMEOUT_MS).toBe(1000);
  });

  it('refuses the two timeouts adding up to REQUEST_TIMEOUT_MS, naming the variables', () => {
    const message = thrownMessage(() =>
      validateEnv({
        ...valid,
        REQUEST_TIMEOUT_MS: '1000',
        DATABASE_STATEMENT_TIMEOUT_MS: '600',
        DATABASE_CONNECTION_TIMEOUT_MS: '400',
      }),
    );

    expect(message).toMatch(/DATABASE_STATEMENT_TIMEOUT_MS: /);
    expect(message).toMatch(/DATABASE_CONNECTION_TIMEOUT_MS/);
    expect(message).toMatch(/REQUEST_TIMEOUT_MS/);
  });

  it('refuses the defaults under a small REQUEST_TIMEOUT_MS', () => {
    expect(() => validateEnv({ ...valid, REQUEST_TIMEOUT_MS: '100' })).toThrow(
      /DATABASE_STATEMENT_TIMEOUT_MS/,
    );
  });
});

describe('validateEnv BODY_LIMIT', () => {
  it('defaults to 102400', () => {
    expect(validateEnv(valid).BODY_LIMIT).toBe(102_400);
  });

  it('coerces a string to a number', () => {
    expect(validateEnv({ ...valid, BODY_LIMIT: '2048' }).BODY_LIMIT).toBe(2048);
  });

  it('accepts the maximum, 1048576', () => {
    expect(validateEnv({ ...valid, BODY_LIMIT: '1048576' }).BODY_LIMIT).toBe(1_048_576);
  });

  it.each(['0', '-1', '1.5', 'abc', '1048577'])('refuses %j, naming the variable', (value) => {
    expect(() => validateEnv({ ...valid, BODY_LIMIT: value })).toThrow(/BODY_LIMIT/);
  });
});

describe('validateEnv SOCKET_MAX_MESSAGE_BYTES', () => {
  it('defaults to 65536', () => {
    expect(validateEnv(valid).SOCKET_MAX_MESSAGE_BYTES).toBe(65_536);
  });

  it.each([
    ['1024', 1024],
    ['1048576', 1_048_576],
  ])('accepts %s', (value, expected) => {
    expect(
      validateEnv({ ...valid, SOCKET_MAX_MESSAGE_BYTES: value }).SOCKET_MAX_MESSAGE_BYTES,
    ).toBe(expected);
  });

  it.each(['0', '-1', '1.5', 'abc', '1048577'])('refuses %j, naming the variable', (value) => {
    expect(() => validateEnv({ ...valid, SOCKET_MAX_MESSAGE_BYTES: value })).toThrow(
      /SOCKET_MAX_MESSAGE_BYTES/,
    );
  });
});

describe('validateEnv S3', () => {
  const required = [
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ] as const;

  it.each(required.flatMap((name) => ['development', 'production', 'test'].map((e) => [name, e])))(
    'refuses a missing %s with NODE_ENV=%s, naming the variable',
    (name, nodeEnv) => {
      const without: Record<string, unknown> = { ...valid, NODE_ENV: nodeEnv };
      delete without[name as string];

      expect(() => validateEnv(without)).toThrow(new RegExp(name as string));
    },
  );

  it('accepts the valid S3 settings and applies the defaults', () => {
    const env = validateEnv(valid);

    expect(env.S3_ENDPOINT).toBe('http://s3:8333');
    expect(env.S3_BUCKET).toBe('lamoda-ai-fitting');
    expect(env.S3_PUBLIC_ENDPOINT).toBe('');
    expect(env.S3_REGION).toBe('ru-1');
    expect(env.S3_SIGNED_URL_TTL_SECONDS).toBe(900);
  });

  it.each(['http://s3:8333', 'https://s3.example.ru'])('accepts S3_ENDPOINT %s', (url) => {
    expect(validateEnv({ ...valid, S3_ENDPOINT: url }).S3_ENDPOINT).toBe(url);
  });

  it.each(['ftp://s3.example.ru', 'not a url', ''])('refuses S3_ENDPOINT %j', (url) => {
    expect(() => validateEnv({ ...valid, S3_ENDPOINT: url })).toThrow(/S3_ENDPOINT/);
  });

  it.each(['', 'http://localhost:8333', 'https://s3.example.ru'])(
    'accepts S3_PUBLIC_ENDPOINT %j',
    (url) => {
      expect(validateEnv({ ...valid, S3_PUBLIC_ENDPOINT: url }).S3_PUBLIC_ENDPOINT).toBe(url);
    },
  );

  it.each(['ftp://s3.example.ru', 'not a url'])('refuses S3_PUBLIC_ENDPOINT %j', (url) => {
    expect(() => validateEnv({ ...valid, S3_PUBLIC_ENDPOINT: url })).toThrow(/S3_PUBLIC_ENDPOINT/);
  });

  it('accepts a set S3_REGION', () => {
    expect(validateEnv({ ...valid, S3_REGION: 'us-east-1' }).S3_REGION).toBe('us-east-1');
  });

  it('refuses an empty S3_REGION', () => {
    expect(() => validateEnv({ ...valid, S3_REGION: '' })).toThrow(/S3_REGION/);
  });

  it.each(['abc', 'my.bucket-1', 'a'.repeat(63), '1bucket1'])('accepts S3_BUCKET %j', (name) => {
    expect(validateEnv({ ...valid, S3_BUCKET: name }).S3_BUCKET).toBe(name);
  });

  it.each([
    ['uppercase', 'MyBucket'],
    ['an underscore', 'my_bucket'],
    ['2 characters', 'ab'],
    ['64 characters', 'a'.repeat(64)],
    ['a leading hyphen', '-bucket'],
    ['a trailing hyphen', 'bucket-'],
    ['empty', ''],
  ])('refuses S3_BUCKET with %s', (_name, bucket) => {
    expect(() => validateEnv({ ...valid, S3_BUCKET: bucket })).toThrow(/S3_BUCKET/);
  });

  describe.each(['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const)('%s', (name) => {
    it.each(['k', 'AKIA+/=0123456789abcdef', 'a-b_c.d'])('accepts %j', (value) => {
      expect(validateEnv({ ...valid, [name]: value })[name]).toBe(value);
    });

    it.each([
      ['empty', ''],
      ['a space inside', 'abc def'],
      ['a leading space', ' abcdef'],
      ['a trailing space', 'abcdef '],
      ['a tab', 'abcdef\t'],
    ])('refuses %s, naming the variable but not the value', (_case, value) => {
      const message = thrownMessage(() => validateEnv({ ...valid, [name]: value }));

      expect(message).toMatch(new RegExp(name));
      if (value !== '') expect(message).not.toContain(value);
    });
  });

  it.each([
    ['60', 60],
    ['3600', 3600],
    ['900', 900],
  ])('accepts S3_SIGNED_URL_TTL_SECONDS %s', (value, expected) => {
    expect(
      validateEnv({ ...valid, S3_SIGNED_URL_TTL_SECONDS: value }).S3_SIGNED_URL_TTL_SECONDS,
    ).toBe(expected);
  });

  it.each(['59', '3601', '1.5', 'abc'])('refuses S3_SIGNED_URL_TTL_SECONDS %j', (value) => {
    expect(() => validateEnv({ ...valid, S3_SIGNED_URL_TTL_SECONDS: value })).toThrow(
      /S3_SIGNED_URL_TTL_SECONDS/,
    );
  });
});

describe('assertServerEnv', () => {
  // A production server environment that passes; each case breaks one thing.
  const production: ServerEnv = {
    NODE_ENV: 'production',
    PROXY_SECRET: 'p'.repeat(32),
    BETTER_AUTH_SECRET: 'b'.repeat(32),
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    AUTH_FAKE_OIDC_URL: '',
    AUTH_FAKE_OIDC_PUBLIC_URL: '',
    OPENAI_API_KEY: 'test-openai-key_1',
    REQUEST_TIMEOUT_MS: 10_000,
    FITTING_CHECK_TIMEOUT_MS: 4000,
  };

  it('accepts production with every secret set and no fake provider', () => {
    expect(() => assertServerEnv(production)).not.toThrow();
  });

  it('refuses production with an empty PROXY_SECRET, naming the variable', () => {
    expect(() => assertServerEnv({ ...production, PROXY_SECRET: '' })).toThrow(
      'Invalid environment: PROXY_SECRET: must be set in production',
    );
  });

  it('still refuses production with an empty PROXY_SECRET when PROXY_SECRET_NEXT is set', () => {
    const env = validateEnv({
      ...valid,
      ...production,
      PROXY_SECRET: '',
      PROXY_SECRET_NEXT: 'n'.repeat(32),
    });

    expect(() => assertServerEnv(env)).toThrow(
      'Invalid environment: PROXY_SECRET: must be set in production',
    );
  });

  it.each(['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const)(
    'refuses production with an empty %s, naming the variable (AC14)',
    (name) => {
      expect(() => assertServerEnv({ ...production, [name]: '' })).toThrow(
        `Invalid environment: ${name}: must be set in production`,
      );
    },
  );

  it.each([
    ['AUTH_FAKE_OIDC_URL', 'http://oidc:4010'],
    ['AUTH_FAKE_OIDC_PUBLIC_URL', 'http://localhost:4010'],
  ] as const)('refuses production with %s set, without its value (AC14)', (name, url) => {
    const message = thrownMessage(() => assertServerEnv({ ...production, [name]: url }));

    expect(message).toBe(`Invalid environment: ${name}: must be empty in production`);
    expect(message).not.toContain(url);
  });

  it('names every problem at once, never a value', () => {
    const message = thrownMessage(() =>
      assertServerEnv({
        NODE_ENV: 'production',
        PROXY_SECRET: '',
        BETTER_AUTH_SECRET: '',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        AUTH_FAKE_OIDC_URL: 'http://oidc:4010',
        AUTH_FAKE_OIDC_PUBLIC_URL: 'http://localhost:4010',
        OPENAI_API_KEY: '',
        REQUEST_TIMEOUT_MS: 10_000,
        FITTING_CHECK_TIMEOUT_MS: 4000,
      }),
    );

    expect(message).toBe(
      'Invalid environment: PROXY_SECRET: must be set in production; ' +
        'BETTER_AUTH_SECRET: must be set in production; ' +
        'GOOGLE_CLIENT_ID: must be set in production; ' +
        'GOOGLE_CLIENT_SECRET: must be set in production; ' +
        'OPENAI_API_KEY: must be set in production; ' +
        'AUTH_FAKE_OIDC_URL: must be empty in production; ' +
        'AUTH_FAKE_OIDC_PUBLIC_URL: must be empty in production',
    );
  });

  it.each(['development', 'test'] as const)(
    'accepts %s with empty secrets, no Google client and the fake provider',
    (nodeEnv) => {
      expect(() =>
        assertServerEnv({
          NODE_ENV: nodeEnv,
          PROXY_SECRET: '',
          BETTER_AUTH_SECRET: '',
          GOOGLE_CLIENT_ID: '',
          GOOGLE_CLIENT_SECRET: '',
          AUTH_FAKE_OIDC_URL: 'http://oidc:4010',
          AUTH_FAKE_OIDC_PUBLIC_URL: 'http://localhost:4010',
          OPENAI_API_KEY: '',
          REQUEST_TIMEOUT_MS: 10_000,
          FITTING_CHECK_TIMEOUT_MS: 4000,
        }),
      ).not.toThrow();
    },
  );
});

describe('serverEnvWarnings', () => {
  const base: ServerEnv = {
    NODE_ENV: 'development',
    PROXY_SECRET: '',
    BETTER_AUTH_SECRET: '',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    AUTH_FAKE_OIDC_URL: '',
    AUTH_FAKE_OIDC_PUBLIC_URL: '',
    OPENAI_API_KEY: '',
    REQUEST_TIMEOUT_MS: 10_000,
    FITTING_CHECK_TIMEOUT_MS: 4000,
  };

  it.each(['development', 'test'] as const)(
    'warns once about an empty BETTER_AUTH_SECRET with NODE_ENV=%s, pointing to init-env.sh',
    (nodeEnv) => {
      const warnings = serverEnvWarnings({ ...base, NODE_ENV: nodeEnv });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/BETTER_AUTH_SECRET/);
      expect(warnings[0]).toMatch(/scripts\/init-env\.sh/);
    },
  );

  it.each(['development', 'test'] as const)(
    'adds the ignored-key warning to the secret one with NODE_ENV=%s',
    (nodeEnv) => {
      const warnings = serverEnvWarnings({
        ...base,
        NODE_ENV: nodeEnv,
        OPENAI_API_KEY: 'test-openai-key_1',
      });

      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toMatch(/BETTER_AUTH_SECRET/);
      expect(warnings[1]).toMatch(/OPENAI_API_KEY/);
      expect(warnings[1]).toMatch(/ignored/);
      expect(warnings.join(' ')).not.toContain('test-openai-key_1');
    },
  );

  it('does not warn in production, even with an empty secret', () => {
    expect(serverEnvWarnings({ ...base, NODE_ENV: 'production' })).toEqual([]);
  });

  it('does not warn when the secret is set, and never repeats its value', () => {
    expect(serverEnvWarnings({ ...base, BETTER_AUTH_SECRET: 'b'.repeat(32) })).toEqual([]);
    expect(serverEnvWarnings({ ...base, PROXY_SECRET: 'p'.repeat(32) }).join(' ')).not.toContain(
      'p'.repeat(32),
    );
  });
});

describe('validateEnv OpenAI and fitting settings', () => {
  it('applies the defaults', () => {
    const env = validateEnv(valid);

    expect(env.OPENAI_API_KEY).toBe('');
    expect(env.FITTING_MODEL).toBe('gpt-image-2');
    expect(env.FITTING_VISION_MODEL).toBe('gpt-6-luna');
    expect(env.FITTING_MONTHLY_LIMIT).toBe(10);
    expect(env.FITTING_TIMEOUT_SECONDS).toBe(180);
    expect(env.FITTING_CHECK_TIMEOUT_MS).toBe(4000);
    expect(env.FITTING_PHOTO_MAX_BYTES).toBe(20_971_520);
  });

  // A made-up value with none of a real key's shape, so the secret scan stays quiet.
  it('accepts a key', () => {
    expect(validateEnv({ ...valid, OPENAI_API_KEY: 'test-openai-key_1' }).OPENAI_API_KEY).toBe(
      'test-openai-key_1',
    );
  });

  it.each(['sk-abc def', ' sk-abc', 'sk-abc\t'])(
    'refuses OPENAI_API_KEY %j, naming the variable but not the value',
    (value) => {
      const message = thrownMessage(() => validateEnv({ ...valid, OPENAI_API_KEY: value }));

      expect(message).toMatch(/OPENAI_API_KEY/);
      expect(message).not.toContain(value);
    },
  );

  it.each(['FITTING_MODEL', 'FITTING_VISION_MODEL'])('accepts a model name in %s', (name) => {
    expect(validateEnv({ ...valid, [name]: 'gpt-image-2.5-sunburst' })).toMatchObject({
      [name]: 'gpt-image-2.5-sunburst',
    });
  });

  it.each(['FITTING_MODEL', 'FITTING_VISION_MODEL'])(
    'refuses a space, a slash or empty in %s',
    (name) => {
      for (const value of ['gpt 5', 'a/b', '']) {
        expect(thrownMessage(() => validateEnv({ ...valid, [name]: value }))).toMatch(
          new RegExp(name),
        );
      }
    },
  );

  it.each([
    ['FITTING_MONTHLY_LIMIT', '1', 1, ['0', '1001', '1.5', 'abc']],
    ['FITTING_MONTHLY_LIMIT', '1000', 1000, []],
    ['FITTING_TIMEOUT_SECONDS', '30', 30, ['29', '601', 'abc']],
    ['FITTING_TIMEOUT_SECONDS', '600', 600, []],
    ['FITTING_CHECK_TIMEOUT_MS', '1000', 1000, ['999', '10001', 'abc']],
    ['FITTING_CHECK_TIMEOUT_MS', '10000', 10_000, []],
    ['FITTING_PHOTO_MAX_BYTES', '1', 1, ['0', '52428801', '-1', 'abc']],
    ['FITTING_PHOTO_MAX_BYTES', '52428800', 52_428_800, []],
  ])('bounds of %s: accepts %s, refuses the outside', (name, value, expected, refused) => {
    expect(validateEnv({ ...valid, [name]: value })).toMatchObject({ [name]: expected });
    for (const bad of refused) {
      expect(thrownMessage(() => validateEnv({ ...valid, [name]: bad }))).toMatch(new RegExp(name));
    }
  });
});

describe('OpenAI key and check timeout in the server and worker checks', () => {
  const server: ServerEnv = {
    NODE_ENV: 'production',
    PROXY_SECRET: 'p'.repeat(32),
    BETTER_AUTH_SECRET: 'b'.repeat(32),
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
    AUTH_FAKE_OIDC_URL: '',
    AUTH_FAKE_OIDC_PUBLIC_URL: '',
    OPENAI_API_KEY: 'test-openai-key_1',
    REQUEST_TIMEOUT_MS: 10_000,
    FITTING_CHECK_TIMEOUT_MS: 4000,
  };

  it('refuses production with an empty OPENAI_API_KEY, naming the variable', () => {
    expect(() => assertServerEnv({ ...server, OPENAI_API_KEY: '' })).toThrow(
      'Invalid environment: OPENAI_API_KEY: must be set in production',
    );
  });

  it.each(['development', 'production', 'test'] as const)(
    'refuses a check timeout over half of REQUEST_TIMEOUT_MS with NODE_ENV=%s',
    (nodeEnv) => {
      expect(() =>
        assertServerEnv({ ...server, NODE_ENV: nodeEnv, FITTING_CHECK_TIMEOUT_MS: 5001 }),
      ).toThrow(/FITTING_CHECK_TIMEOUT_MS/);
    },
  );

  it.each(['development', 'production', 'test'] as const)(
    'accepts a check timeout of exactly half with NODE_ENV=%s',
    (nodeEnv) => {
      expect(() =>
        assertServerEnv({ ...server, NODE_ENV: nodeEnv, FITTING_CHECK_TIMEOUT_MS: 5000 }),
      ).not.toThrow();
    },
  );

  it('throws in the worker in production with an empty key, naming the variable', () => {
    expect(() => assertWorkerEnv({ NODE_ENV: 'production', OPENAI_API_KEY: '' })).toThrow(
      /OPENAI_API_KEY/,
    );
  });

  it.each([
    ['production', 'test-openai-key_1'],
    ['development', ''],
    ['test', ''],
  ] as const)('passes in the worker with NODE_ENV=%s and key %j', (nodeEnv, key) => {
    expect(() => assertWorkerEnv({ NODE_ENV: nodeEnv, OPENAI_API_KEY: key })).not.toThrow();
  });

  it.each(['development', 'test'] as const)(
    'warns that a set key is ignored with NODE_ENV=%s, in the server and the worker',
    (nodeEnv) => {
      const withKey = { ...server, NODE_ENV: nodeEnv };
      const key = 'test-openai-key_1';

      const serverWarnings = serverEnvWarnings(withKey);
      const workerWarnings = workerEnvWarnings({ NODE_ENV: nodeEnv, OPENAI_API_KEY: key });

      expect(serverWarnings).toHaveLength(1);
      expect(serverWarnings[0]).toMatch(/OPENAI_API_KEY/);
      expect(serverWarnings[0]).toMatch(/ignored/);
      expect(workerWarnings).toHaveLength(1);
      expect(workerWarnings[0]).toMatch(/OPENAI_API_KEY/);
      expect(workerWarnings[0]).toMatch(/ignored/);
      expect(serverWarnings.join(' ') + workerWarnings.join(' ')).not.toContain(key);
    },
  );

  it.each(['development', 'test'] as const)(
    'does not warn about an empty key with NODE_ENV=%s',
    (nodeEnv) => {
      expect(serverEnvWarnings({ ...server, NODE_ENV: nodeEnv, OPENAI_API_KEY: '' })).toEqual([]);
      expect(workerEnvWarnings({ NODE_ENV: nodeEnv, OPENAI_API_KEY: '' })).toEqual([]);
    },
  );

  it('does not warn in production, with the key set or empty', () => {
    for (const key of ['', 'test-openai-key_1']) {
      expect(workerEnvWarnings({ NODE_ENV: 'production', OPENAI_API_KEY: key })).toEqual([]);
      expect(serverEnvWarnings({ ...server, OPENAI_API_KEY: key })).toEqual([]);
    }
  });
});

describe('validateEnv auth', () => {
  it('defaults every auth variable to an empty string', () => {
    const env = validateEnv(valid);

    expect(env.BETTER_AUTH_SECRET).toBe('');
    expect(env.GOOGLE_CLIENT_ID).toBe('');
    expect(env.GOOGLE_CLIENT_SECRET).toBe('');
    expect(env.AUTH_FAKE_OIDC_URL).toBe('');
    expect(env.AUTH_FAKE_OIDC_PUBLIC_URL).toBe('');
  });

  it.each(['', 'a'.repeat(32), 'ab12'.repeat(16)])('accepts BETTER_AUTH_SECRET %j', (secret) => {
    expect(validateEnv({ ...valid, BETTER_AUTH_SECRET: secret }).BETTER_AUTH_SECRET).toBe(secret);
  });

  // Letters and digits only: the server's .env is sourced by the deploy (spec 0013 N21).
  it.each([
    ['31 characters', 'a'.repeat(31)],
    ['a space inside', `${'a'.repeat(20)} ${'a'.repeat(19)}`],
    ['a trailing space', `${'a'.repeat(39)} `],
    ['a dollar sign', `${'a'.repeat(39)}$`],
    ['a double quote', `${'a'.repeat(39)}"`],
    ['a semicolon', `${'a'.repeat(39)};`],
    ['a hyphen', `${'a'.repeat(20)}-${'a'.repeat(19)}`],
  ])('refuses BETTER_AUTH_SECRET with %s, naming the variable but not the value', (_n, secret) => {
    const message = thrownMessage(() => validateEnv({ ...valid, BETTER_AUTH_SECRET: secret }));

    expect(message).toMatch(/BETTER_AUTH_SECRET/);
    expect(message).not.toContain(secret);
  });

  it.each(['PROXY_SECRET', 'PROXY_SECRET_NEXT'])(
    'refuses BETTER_AUTH_SECRET equal to %s, naming the variables but not the value',
    (name) => {
      const shared = 'sharedvalue0123456789abcdefxyz01';

      const message = thrownMessage(() =>
        validateEnv({ ...valid, [name]: shared, BETTER_AUTH_SECRET: shared }),
      );

      expect(message).toMatch(
        /BETTER_AUTH_SECRET: must differ from PROXY_SECRET and PROXY_SECRET_NEXT/,
      );
      expect(message).not.toContain(shared);
    },
  );

  it('accepts BETTER_AUTH_SECRET that differs from both proxy secrets', () => {
    const env = validateEnv({
      ...valid,
      PROXY_SECRET: 'p'.repeat(32),
      PROXY_SECRET_NEXT: 'n'.repeat(32),
      BETTER_AUTH_SECRET: 'b'.repeat(32),
    });

    expect(env.BETTER_AUTH_SECRET).toBe('b'.repeat(32));
  });

  it('accepts both fake provider addresses', () => {
    const env = validateEnv({
      ...valid,
      AUTH_FAKE_OIDC_URL: 'http://oidc:4010',
      AUTH_FAKE_OIDC_PUBLIC_URL: 'http://localhost:4010',
    });

    expect(env.AUTH_FAKE_OIDC_URL).toBe('http://oidc:4010');
    expect(env.AUTH_FAKE_OIDC_PUBLIC_URL).toBe('http://localhost:4010');
  });

  it.each([
    ['only the server address', 'http://oidc:4010', ''],
    ['only the public address', '', 'http://localhost:4010'],
  ])('refuses %s of the fake provider', (_name, url, publicUrl) => {
    expect(() =>
      validateEnv({ ...valid, AUTH_FAKE_OIDC_URL: url, AUTH_FAKE_OIDC_PUBLIC_URL: publicUrl }),
    ).toThrow(/AUTH_FAKE_OIDC_PUBLIC_URL: must be set together with AUTH_FAKE_OIDC_URL/);
  });

  it.each(['ftp://oidc:4010', 'oidc:4010', 'not a url'])(
    'refuses AUTH_FAKE_OIDC_URL %j, naming the variable',
    (url) => {
      expect(() =>
        validateEnv({
          ...valid,
          AUTH_FAKE_OIDC_URL: url,
          AUTH_FAKE_OIDC_PUBLIC_URL: 'http://localhost:4010',
        }),
      ).toThrow(/AUTH_FAKE_OIDC_URL/);
    },
  );
});
