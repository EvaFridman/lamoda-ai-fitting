import { request as httpRequest } from 'node:http';
import { type AddressInfo, createServer } from 'node:net';

import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent, NodeOptions } from '@sentry/nestjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isRedisCommand,
  isThrottled,
  sentryOptions,
  storageOrigin,
  withoutPrismaMessages,
  withoutRedisCommands,
  withoutRequestData,
  withoutStoragePath,
  withoutStoragePaths,
  withoutUserAgent,
} from './sentry.options.js';

type TransactionEvent = Parameters<NonNullable<NodeOptions['beforeSendTransaction']>>[0];
type TracesSamplerContext = Parameters<
  NonNullable<ReturnType<typeof sentryOptions>['tracesSampler']>
>[0];

describe('sentryOptions', () => {
  it('turns Sentry off with a missing or empty SENTRY_DSN', () => {
    expect(sentryOptions({}).dsn).toBeUndefined();
    expect(sentryOptions({ SENTRY_DSN: '' }).dsn).toBeUndefined();
  });

  it('passes a set SENTRY_DSN through', () => {
    const dsn = 'https://key@o0.ingest.sentry.io/1';

    expect(sentryOptions({ SENTRY_DSN: dsn }).dsn).toBe(dsn);
  });

  it('takes the environment from SENTRY_ENVIRONMENT, else from NODE_ENV', () => {
    expect(
      sentryOptions({ SENTRY_ENVIRONMENT: 'staging', NODE_ENV: 'production' }).environment,
    ).toBe('staging');
    expect(sentryOptions({ SENTRY_ENVIRONMENT: '', NODE_ENV: 'production' }).environment).toBe(
      'production',
    );
    expect(sentryOptions({ NODE_ENV: 'development' }).environment).toBe('development');
  });

  it('takes the release from APP_VERSION', () => {
    expect(sentryOptions({ APP_VERSION: 'abc123' }).release).toBe('abc123');
  });

  it('collects no personal data, headers, bodies, queries or variables', () => {
    expect(sentryOptions({}).dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
    });
  });

  describe('tracesSampler', () => {
    const sampler = (context: Partial<TracesSamplerContext>): unknown =>
      sentryOptions({}).tracesSampler?.(context as TracesSamplerContext);
    const request = (url: string): Partial<TracesSamplerContext> => ({
      normalizedRequest: { url },
    });

    it.each(['/health/live', '/health/ready', 'http://api:3000/health/live'])(
      'does not trace the health check %s',
      (url) => {
        expect(sampler(request(url))).toBe(0);
      },
    );

    it('samples other requests at a fixed 0.1', () => {
      expect(sampler(request('/products'))).toBe(0.1);
      expect(sampler(request('http://api:3000/products?health=1'))).toBe(0.1);
    });

    it('samples at 0.1 when there is no request', () => {
      expect(sampler({})).toBe(0.1);
    });

    it('does not inherit the decision of an incoming trace', () => {
      expect(sampler({ ...request('/products'), parentSampled: true })).toBe(0.1);
      expect(sampler({ ...request('/health/live'), parentSampled: true })).toBe(0);
    });
  });

  it('adds the unhandled rejection integration', () => {
    const names = sentryOptions({}).integrations;

    expect(Array.isArray(names) && names.map((integration) => integration.name)).toContain(
      'OnUnhandledRejection',
    );
  });

  describe('beforeBreadcrumb', () => {
    const hook = sentryOptions({}).beforeBreadcrumb;

    it('drops console breadcrumbs', () => {
      expect(hook?.({ category: 'console', message: 'x' }, undefined)).toBeNull();
    });

    it('keeps the others', () => {
      const breadcrumb = { category: 'http', message: 'x' };

      expect(hook?.(breadcrumb, undefined)).toBe(breadcrumb);
      expect(hook?.({ message: 'no category' }, undefined)).toEqual({ message: 'no category' });
    });
  });

  describe('beforeSendTransaction', () => {
    const hook = (event: TransactionEvent) =>
      sentryOptions({}).beforeSendTransaction?.(event, {}) as TransactionEvent | null;

    it('drops a transaction answered with 429', () => {
      const event = {
        type: 'transaction',
        contexts: { trace: { data: { 'http.response.status_code': 429 } } },
      } as unknown as TransactionEvent;

      expect(isThrottled(event)).toBe(true);
      expect(hook(event)).toBeNull();
    });

    it('keeps other transactions, cleaned of request data and the user agent', () => {
      const event = {
        type: 'transaction',
        request: { url: '/a?token=abc', data: 'abc', headers: { h: 'abc' } },
        contexts: {
          trace: {
            data: { 'http.response.status_code': 200, 'user_agent.original': 'curl/8' },
          },
        },
        spans: [
          { data: { 'user_agent.original': 'curl/8', 'http.method': 'GET' } },
          { data: undefined },
        ],
      } as unknown as TransactionEvent;

      expect(isThrottled(event)).toBe(false);
      const result = hook(event);

      expect(result?.request).toEqual({ url: '/a' });
      expect(result?.contexts?.trace?.data).toEqual({ 'http.response.status_code': 200 });
      expect(result?.spans?.[0]?.data).toEqual({ 'http.method': 'GET' });
    });

    it('removes Redis query text from spans, with the other cleanup still applied', () => {
      const event = {
        type: 'transaction',
        request: { url: '/a?token=abc', data: 'abc' },
        contexts: { trace: { data: { 'user_agent.original': 'curl/8' } } },
        spans: [
          {
            description: 'redis-eval',
            data: {
              'db.system.name': 'redis',
              'db.query.text': 'eval script key-hash',
              'db.operation.name': 'eval',
            },
          },
        ],
      } as unknown as TransactionEvent;

      const result = hook(event);

      expect(result?.request).toEqual({ url: '/a' });
      expect(result?.contexts?.trace?.data).toEqual({});
      expect(result?.spans?.[0]?.description).toBe('redis-eval');
      expect(result?.spans?.[0]?.data).toEqual({
        'db.system.name': 'redis',
        'db.operation.name': 'eval',
      });
    });

    it('drops a transaction whose root is a Redis command', () => {
      const event = {
        type: 'transaction',
        transaction: 'evalsha abc 1 hash-of-ip:hits',
        contexts: { trace: { data: { 'db.system.name': 'redis', 'db.query.text': 'x' } } },
      } as unknown as TransactionEvent;

      expect(hook(event)).toBeNull();
    });

    it('still drops a 429 transaction that has Redis spans', () => {
      const event = {
        type: 'transaction',
        contexts: { trace: { data: { 'http.response.status_code': 429 } } },
        spans: [{ data: { 'db.system.name': 'redis', 'db.query.text': 'x' } }],
      } as unknown as TransactionEvent;

      expect(hook(event)).toBeNull();
    });

    it('handles a transaction without contexts and spans', () => {
      const event = { type: 'transaction' } as TransactionEvent;

      expect(isThrottled(event)).toBe(false);
      expect(withoutUserAgent(event)).toBe(event);
      expect(hook(event)).toEqual({ type: 'transaction' });
    });
  });
});

describe('withoutPrismaMessages', () => {
  const eventWith = (values: { type?: string; value?: string }[] | undefined): ErrorEvent =>
    ({ type: undefined, exception: values && { values } }) as unknown as ErrorEvent;

  it('replaces the message of a Prisma error and keeps its type', () => {
    const event = eventWith([
      { type: 'PrismaClientKnownRequestError', value: 'Failing row contains (Ivan)' },
    ]);

    const result = withoutPrismaMessages(event);

    expect(result).toBe(event);
    expect(result.exception?.values?.[0]?.type).toBe('PrismaClientKnownRequestError');
    expect(result.exception?.values?.[0]?.value).toBe('[removed: may hold data]');
  });

  it('replaces only the Prisma values of a chain', () => {
    const event = eventWith([
      { type: 'Error', value: 'outer' },
      { type: 'PrismaClientValidationError', value: 'data: { phone: "+7999" }' },
      { type: 'PrismaClientInitializationError', value: 'secret url' },
    ]);

    const values = withoutPrismaMessages(event).exception?.values;

    expect(values?.map((entry) => entry.value)).toEqual([
      'outer',
      '[removed: may hold data]',
      '[removed: may hold data]',
    ]);
  });

  it('leaves the values of other errors untouched', () => {
    const event = eventWith([
      { type: 'TypeError', value: 'x is not a function' },
      { value: 'no type' },
    ]);

    expect(withoutPrismaMessages(event).exception?.values).toEqual([
      { type: 'TypeError', value: 'x is not a function' },
      { value: 'no type' },
    ]);
  });

  it('handles an event without exception', () => {
    const event = eventWith(undefined);

    expect(withoutPrismaMessages(event)).toBe(event);
  });
});

describe('withoutRedisCommands', () => {
  const eventWith = (spans: unknown): TransactionEvent =>
    ({ type: 'transaction', spans }) as TransactionEvent;

  it.each([
    ['db.system.name', 'db.query.text'],
    ['db.system', 'db.statement'],
    ['db.system.name', 'db.statement'],
    ['db.system', 'db.query.text'],
  ])('drops the query of a span marked %s, keeping the other fields', (systemKey, queryKey) => {
    const event = eventWith([
      {
        description: 'redis-eval',
        data: {
          [systemKey]: 'redis',
          [queryKey]: 'eval script hash-of-ip',
          'db.operation.name': 'eval',
          'server.address': 'redis',
        },
      },
    ]);

    const result = withoutRedisCommands(event);

    expect(result).toBe(event);
    expect(result.spans?.[0]).toEqual({
      description: 'redis-eval',
      data: { [systemKey]: 'redis', 'db.operation.name': 'eval', 'server.address': 'redis' },
    });
  });

  it('drops both query fields when a span has both', () => {
    const event = eventWith([
      { data: { 'db.system': 'redis', 'db.query.text': 'a', 'db.statement': 'b' } },
    ]);

    expect(withoutRedisCommands(event).spans?.[0]?.data).toEqual({ 'db.system': 'redis' });
  });

  it('cleans every Redis span and leaves spans of other systems untouched', () => {
    const postgres = {
      data: { 'db.system.name': 'postgresql', 'db.query.text': 'SELECT 1', 'db.statement': 's' },
    };
    const event = eventWith([
      { data: { 'db.system.name': 'redis', 'db.query.text': 'one' } },
      postgres,
      { data: { 'db.system': 'redis', 'db.statement': 'two' } },
    ]);

    const spans = withoutRedisCommands(event).spans;

    expect(spans?.[0]?.data).toEqual({ 'db.system.name': 'redis' });
    expect(spans?.[1]).toEqual({
      data: { 'db.system.name': 'postgresql', 'db.query.text': 'SELECT 1', 'db.statement': 's' },
    });
    expect(spans?.[2]?.data).toEqual({ 'db.system': 'redis' });
  });

  it.each([
    ['evalsha abc 1 hash-of-ip:hits', 'evalsha', 'redis-evalsha'],
    ['get key', undefined, 'redis'],
    ['eval x', 'eval x', 'redis'],
    ['get key', '', 'redis'],
  ])('renames the Redis span %j with operation %j to %j', (description, operation, expected) => {
    const event = eventWith([
      {
        description,
        data: { 'db.system.name': 'redis', 'db.operation.name': operation },
      },
    ]);

    expect(withoutRedisCommands(event).spans?.[0]?.description).toBe(expected);
  });

  it('keeps description and data of spans of other systems', () => {
    const event = eventWith([
      { description: 'SELECT * FROM users', data: { 'db.system.name': 'postgresql' } },
      { description: 'GET /x', data: { 'http.method': 'GET' } },
      { description: 'no data' },
    ]);

    expect(withoutRedisCommands(event).spans).toEqual([
      { description: 'SELECT * FROM users', data: { 'db.system.name': 'postgresql' } },
      { description: 'GET /x', data: { 'http.method': 'GET' } },
      { description: 'no data' },
    ]);
  });

  it('keeps the name and data of an http root', () => {
    const event = {
      type: 'transaction',
      transaction: 'GET /products',
      contexts: { trace: { data: { 'http.method': 'GET', 'db.query.text': 'kept' } } },
    } as unknown as TransactionEvent;

    const result = withoutRedisCommands(event);

    expect(result.transaction).toBe('GET /products');
    expect(result.contexts?.trace?.data).toEqual({ 'http.method': 'GET', 'db.query.text': 'kept' });
  });

  it('does not throw on an event without spans or a span without data', () => {
    expect(() => withoutRedisCommands({ type: 'transaction' } as TransactionEvent)).not.toThrow();
    expect(() => withoutRedisCommands(eventWith([]))).not.toThrow();
    expect(() => withoutRedisCommands(eventWith([{}, { data: undefined }]))).not.toThrow();
  });
});

describe('isRedisCommand', () => {
  const rootWith = (data: Record<string, unknown> | undefined): TransactionEvent =>
    ({ type: 'transaction', contexts: { trace: { data } } }) as unknown as TransactionEvent;

  it.each(['db.system.name', 'db.system'])('is true for a root marked %s = redis', (key) => {
    expect(isRedisCommand(rootWith({ [key]: 'redis' }))).toBe(true);
  });

  it('is false for an http root, other databases, no data and no contexts', () => {
    expect(isRedisCommand(rootWith({ 'http.method': 'GET' }))).toBe(false);
    expect(isRedisCommand(rootWith({ 'db.system.name': 'postgresql' }))).toBe(false);
    expect(isRedisCommand(rootWith(undefined))).toBe(false);
    expect(isRedisCommand({ type: 'transaction' } as TransactionEvent)).toBe(false);
  });
});

describe('withoutRequestData', () => {
  it('drops data, headers, cookies and the query, and keeps the method and the path', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        method: 'POST',
        url: 'http://api:3000/products?token=abc',
        data: { phone: '+7999' },
        headers: { 'x-proxy-secret': 'abc' },
        cookies: { session: 'abc' },
        query_string: 'token=abc',
      },
    };

    const result = withoutRequestData(event);

    expect(result).toBe(event);
    expect(result).toEqual({
      type: undefined,
      request: { method: 'POST', url: 'http://api:3000/products' },
    });
  });

  it('leaves an url without a query as it is', () => {
    const event = { request: { method: 'GET', url: '/products' } } as ErrorEvent;

    expect(withoutRequestData(event).request).toEqual({ method: 'GET', url: '/products' });
  });

  it('handles an event without request', () => {
    const event = { message: 'x' } as ErrorEvent;

    expect(withoutRequestData(event)).toEqual({ message: 'x' });
  });

  it('is applied to errors after the Prisma cleanup, and to transactions', () => {
    const options = sentryOptions({});
    const hint = {};
    const request = () => ({ url: '/a?token=abc', data: 'abc', headers: { h: 'abc' } });

    const error = options.beforeSend?.(
      {
        type: undefined,
        request: request(),
        exception: { values: [{ type: 'PrismaClientValidationError', value: 'secret call' }] },
      },
      hint,
    ) as ErrorEvent;
    const transaction = options.beforeSendTransaction?.(
      { type: 'transaction', request: request() } as TransactionEvent,
      hint,
    ) as TransactionEvent;

    expect(error.request).toEqual({ url: '/a' });
    expect(error.exception?.values?.[0]?.value).toBe('[removed: may hold data]');
    expect(transaction.request).toEqual({ url: '/a' });
  });
});

describe('storageOrigin', () => {
  it.each([undefined, '', 'not a url', '/relative'])('is undefined for %j', (endpoint) => {
    expect(storageOrigin(endpoint)).toBeUndefined();
  });

  it.each([
    ['http://s3:8333/', 'http://s3:8333'],
    ['https://s3.twcstorage.ru', 'https://s3.twcstorage.ru'],
  ])('gives the origin of %s', (endpoint, origin) => {
    expect(storageOrigin(endpoint)).toBe(origin);
  });
});

describe('withoutStoragePaths', () => {
  const ORIGIN = 'http://s3:8333';
  const eventWith = (spans: unknown): TransactionEvent =>
    ({ type: 'transaction', spans }) as TransactionEvent;

  it('keeps only the method and the origin of a put span', () => {
    const event = eventWith([
      {
        description: 'PUT http://s3:8333/bucket/keep/users/u1/...',
        data: {
          'url.full': 'http://s3:8333/bucket/keep/users/u1/photos/a.webp?x-id=PutObject',
          'url.path': '/bucket/keep/users/u1/photos/a.webp',
          'url.query': '?x-id=PutObject',
          'url.fragment': '#f',
          'http.target': '/bucket/keep/users/u1/photos/a.webp?x-id=PutObject',
          'http.request.method': 'PUT',
          'http.response.status_code': 200,
        },
      },
    ]);

    const span = withoutStoragePaths(event, ORIGIN).spans?.[0];

    expect(span?.description).toBe('PUT http://s3:8333');
    expect(span?.data).toEqual({
      'url.full': ORIGIN,
      'http.request.method': 'PUT',
      'http.response.status_code': 200,
    });
  });

  it('cleans a list span, whose query holds the prefix', () => {
    const event = eventWith([
      {
        description: 'GET http://s3:8333/bucket?list-type=2&prefix=keep%2Fusers%2Fu1%2F',
        data: {
          'url.full': 'http://s3:8333/bucket?list-type=2&prefix=keep%2Fusers%2Fu1%2F',
          'url.query': '?list-type=2&prefix=keep%2Fusers%2Fu1%2F',
          'http.request.method': 'GET',
        },
      },
    ]);

    const span = withoutStoragePaths(event, ORIGIN).spans?.[0];

    expect(span?.description).toBe('GET http://s3:8333');
    expect(span?.data).toEqual({ 'url.full': ORIGIN, 'http.request.method': 'GET' });
  });

  it('leaves a span to another host unchanged', () => {
    const spans = [
      {
        description: 'GET https://api.example.com/v1/x',
        data: {
          'url.full': 'https://api.example.com/v1/x',
          'url.path': '/v1/x',
          'http.request.method': 'GET',
        },
      },
    ];
    const expected = structuredClone(spans);

    expect(withoutStoragePaths(eventWith(spans), ORIGIN).spans).toEqual(expected);
  });

  it('leaves everything unchanged without an origin', () => {
    const spans = [
      {
        description: 'PUT http://s3:8333/bucket/keep/users/u1/a.webp',
        data: { 'url.full': 'http://s3:8333/bucket/keep/users/u1/a.webp', 'url.path': '/bucket' },
      },
    ];
    const expected = structuredClone(spans);

    expect(withoutStoragePaths(eventWith(spans), undefined).spans).toEqual(expected);
  });

  it('handles spans without data and an event without spans', () => {
    expect(() => withoutStoragePaths(eventWith([{}, { data: undefined }]), ORIGIN)).not.toThrow();
    expect(() =>
      withoutStoragePaths({ type: 'transaction' } as TransactionEvent, ORIGIN),
    ).not.toThrow();
  });
});

describe('withoutStoragePath', () => {
  const ORIGIN = 'http://s3:8333';

  it('keeps only the origin in the url of an http breadcrumb', () => {
    const breadcrumb = {
      category: 'http',
      data: {
        url: 'http://s3:8333/bucket/keep/users/u1/a.webp',
        'url.query': 'x-id=GetObject',
        'url.fragment': 'f',
        method: 'GET',
        status_code: 200,
      },
    };

    expect(withoutStoragePath(breadcrumb, ORIGIN).data).toEqual({
      url: ORIGIN,
      method: 'GET',
      status_code: 200,
    });
  });

  it('leaves another host, another category and no origin unchanged', () => {
    const other = { category: 'http', data: { url: 'https://api.example.com/v1/x' } };
    const category = { category: 'fetch', data: { url: 'http://s3:8333/bucket/a' } };
    const storage = { category: 'http', data: { url: 'http://s3:8333/bucket/a' } };

    expect(withoutStoragePath(other, ORIGIN)).toEqual({
      category: 'http',
      data: { url: 'https://api.example.com/v1/x' },
    });
    expect(withoutStoragePath(category, ORIGIN).data).toEqual({ url: 'http://s3:8333/bucket/a' });
    expect(withoutStoragePath(storage, undefined).data).toEqual({ url: 'http://s3:8333/bucket/a' });
    expect(withoutStoragePath({ category: 'http' }, ORIGIN)).toEqual({ category: 'http' });
  });
});

describe('sentryOptions with S3_ENDPOINT', () => {
  const storageSpan = (): TransactionEvent =>
    ({
      type: 'transaction',
      spans: [
        {
          description: 'PUT http://s3:8333/bucket/keep/users/u1/a.webp',
          data: {
            'url.full': 'http://s3:8333/bucket/keep/users/u1/a.webp',
            'url.path': '/bucket/keep/users/u1/a.webp',
            'http.request.method': 'PUT',
          },
        },
      ],
    }) as unknown as TransactionEvent;
  const storageCrumb = () => ({
    category: 'http',
    data: { url: 'http://s3:8333/bucket/keep/users/u1/a.webp', 'url.query': 'x' },
  });

  it('cleans spans and breadcrumbs of the storage', () => {
    const options = sentryOptions({ S3_ENDPOINT: 'http://s3:8333' });

    const event = options.beforeSendTransaction?.(storageSpan(), {}) as TransactionEvent;
    const crumb = options.beforeBreadcrumb?.(storageCrumb(), undefined);

    expect(event.spans?.[0]?.description).toBe('PUT http://s3:8333');
    expect(event.spans?.[0]?.data).toEqual({
      'url.full': 'http://s3:8333',
      'http.request.method': 'PUT',
    });
    expect(crumb?.data).toEqual({ url: 'http://s3:8333' });
    expect(options.beforeBreadcrumb?.({ category: 'console', message: 'x' }, undefined)).toBeNull();
  });

  it('leaves them alone without S3_ENDPOINT', () => {
    const options = sentryOptions({});

    const event = options.beforeSendTransaction?.(storageSpan(), {}) as TransactionEvent;
    const crumb = options.beforeBreadcrumb?.(storageCrumb(), undefined);

    expect(event.spans?.[0]?.data?.['url.path']).toBe('/bucket/keep/users/u1/a.webp');
    expect(crumb?.data?.['url']).toBe('http://s3:8333/bucket/keep/users/u1/a.webp');
  });
});

describe('sentryOptions with requests to OpenAI', () => {
  const url = 'https://api.openai.com/v1/responses?x=1';

  it('cuts a span of a request to OpenAI to the method and the origin', () => {
    const event = {
      type: 'transaction',
      spans: [
        {
          description: `POST ${url}`,
          data: {
            'url.full': url,
            'url.path': '/v1/responses',
            'url.query': '?x=1',
            'http.request.method': 'POST',
          },
        },
      ],
    } as unknown as TransactionEvent;

    const result = sentryOptions({}).beforeSendTransaction?.(event, {}) as TransactionEvent;

    expect(result.spans?.[0]?.description).toBe('POST https://api.openai.com');
    expect(result.spans?.[0]?.data).toEqual({
      'url.full': 'https://api.openai.com',
      'http.request.method': 'POST',
    });
  });

  it('cuts the url of an http breadcrumb to the origin', () => {
    const crumb = sentryOptions({}).beforeBreadcrumb?.(
      { category: 'http', data: { url, 'url.query': 'x=1', method: 'POST' } },
      undefined,
    );

    expect(crumb?.data).toEqual({ url: 'https://api.openai.com', method: 'POST' });
  });

  it('cuts both the storage and OpenAI in one breadcrumb hook', () => {
    const options = sentryOptions({ S3_ENDPOINT: 'http://s3:8333' });

    expect(
      options.beforeBreadcrumb?.(
        { category: 'http', data: { url: 'http://s3:8333/bucket/a' } },
        undefined,
      )?.data,
    ).toEqual({ url: 'http://s3:8333' });
    expect(
      options.beforeBreadcrumb?.({ category: 'http', data: { url } }, undefined)?.data,
    ).toEqual({ url: 'https://api.openai.com' });
  });
});

describe('the SDK with sentryOptions', () => {
  afterEach(async () => {
    await Sentry.close();
  });

  function initWith(env: NodeJS.ProcessEnv, overrides: NodeOptions = {}): string[] {
    const sent: string[] = [];
    Sentry.init({
      ...sentryOptions(env),
      ...overrides,
      transport: () => ({
        send: (envelope) => {
          sent.push(JSON.stringify(envelope));
          return Promise.resolve({});
        },
        flush: () => Promise.resolve(true),
      }),
    });
    return sent;
  }

  it('sends nothing with an empty DSN', async () => {
    const sent = initWith({ SENTRY_DSN: '' });

    Sentry.captureException(new Error('boom'));
    await Sentry.flush(1000);

    expect(Sentry.getClient()?.getDsn()).toBeUndefined();
    expect(sent).toEqual([]);
  });

  it('sends an error with the DSN set, as the control of the next test', async () => {
    const sent = initWith({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/1', APP_VERSION: 'v1' });

    Sentry.captureException(new Error('boom'));
    await Sentry.flush(1000);

    const events = sent.filter((envelope) => envelope.includes('"type":"event"'));
    expect(events).toHaveLength(1);
    expect(events[0]).toContain('boom');
    expect(events[0]).toContain('"release":"v1"');
  });

  it('never sends X-Proxy-Secret, cookies, the body or the query string', async () => {
    const sent = initWith({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/1' });
    // Built at run time: Sentry attaches the source lines around a stack frame, and a literal
    // here would end up in the event by itself.
    const leak = (name: string): string => `leak-${name}-value`;
    const proxySecret = leak('proxy-secret');
    const cookie = leak('cookie');
    const query = leak('query');
    const body = leak('body');

    Sentry.withIsolationScope((scope) => {
      // What Sentry's http instrumentation puts there for a request. The SDK itself keeps the
      // body that is already on the scope, so withoutRequestData is what removes it.
      scope.setSDKProcessingMetadata({
        normalizedRequest: {
          method: 'POST',
          url: `http://api:3000/products?token=${query}`,
          headers: {
            'x-proxy-secret': proxySecret,
            cookie: `session=${cookie}`,
            host: 'api',
          },
          cookies: { session: cookie },
          query_string: `token=${query}`,
          data: { phone: body },
        },
      });
      Sentry.captureException(new Error('request failed'));
    });
    await Sentry.flush(1000);

    const events = sent.filter((envelope) => envelope.includes('"type":"event"'));
    expect(events).toHaveLength(1);
    expect(events[0]).toContain('request failed');
    expect(events[0]).toContain('http://api:3000/products');
    for (const secret of [proxySecret, cookie, query, body]) {
      expect(events[0]).not.toContain(secret);
    }
  });

  describe('transactions', () => {
    const DSN = 'https://key@o0.ingest.sentry.io/1';
    // Only the rate is replaced, so every transaction is sampled; the rest is the real config.
    const sampleAll: NodeOptions = { tracesSampler: () => 1 };

    function runRequest(statusCode: number, userAgent: string): void {
      Sentry.startSpan(
        {
          name: 'GET /x',
          forceTransaction: true,
          attributes: {
            'user_agent.original': userAgent,
            'http.response.status_code': statusCode,
          },
        },
        () => {
          Sentry.startSpan(
            { name: 'db', attributes: { 'user_agent.original': userAgent } },
            () => undefined,
          );
        },
      );
    }

    const transactions = (sent: string[]): string[] =>
      sent.filter((envelope) => envelope.includes('"type":"transaction"'));

    it('uses the static trace lifecycle, so beforeSendTransaction runs', () => {
      expect(sentryOptions({}).traceLifecycle).toBe('static');
    });

    it('sends a transaction without the user agent and without the ignored-hook warning', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const sent = initWith({ SENTRY_DSN: DSN }, sampleAll);
      const userAgent = ['leak', 'agent', 'value'].join('-');

      runRequest(200, userAgent);
      await Sentry.flush(1000);

      const sentTransactions = transactions(sent);
      expect(sentTransactions).toHaveLength(1);
      expect(sentTransactions[0]).toContain('GET /x');
      expect(sentTransactions[0]).toContain('"http.response.status_code":200');
      expect(sentTransactions[0]).not.toContain(userAgent);
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('beforeSendTransaction'));
      warn.mockRestore();
    });

    it('sends a Redis span without its query text', async () => {
      const sent = initWith({ SENTRY_DSN: DSN }, sampleAll);
      const queryText = ['leak', 'redis', 'key'].join('-');

      Sentry.startSpan({ name: 'GET /x', forceTransaction: true }, () => {
        Sentry.startSpan(
          {
            name: 'redis-eval',
            op: 'db.query',
            attributes: {
              'db.system.name': 'redis',
              'db.query.text': queryText,
              'db.operation.name': 'eval',
            },
          },
          () => undefined,
        );
      });
      await Sentry.flush(1000);

      const sentTransactions = transactions(sent);
      expect(sentTransactions).toHaveLength(1);
      expect(sentTransactions[0]).toContain('redis-eval');
      expect(sentTransactions[0]).toContain('"db.operation.name":"eval"');
      expect(sentTransactions[0]).not.toContain(queryText);
    });

    it('sends nothing for a Redis command run without a request', async () => {
      const sent = initWith({ SENTRY_DSN: DSN }, sampleAll);
      const command = ['evalsha', 'abc', '1', ['leak', 'ip', 'hash'].join('-') + ':hits'].join(' ');

      Sentry.startSpan(
        {
          name: command,
          op: 'db.query',
          attributes: {
            'db.system.name': 'redis',
            'db.query.text': command,
            'db.operation.name': 'evalsha',
          },
        },
        () => undefined,
      );
      await Sentry.flush(1000);

      expect(transactions(sent)).toEqual([]);
      expect(sent.join('')).not.toContain('leak-ip-hash');
    });

    it('sends a child span named after the whole command as redis-<op>', async () => {
      const sent = initWith({ SENTRY_DSN: DSN }, sampleAll);
      const command = `get ${['leak', 'child', 'key'].join('-')}`;

      Sentry.startSpan({ name: 'GET /x', forceTransaction: true }, () => {
        Sentry.startSpan(
          {
            name: command,
            attributes: { 'db.system.name': 'redis', 'db.operation.name': 'get' },
          },
          () => undefined,
        );
      });
      await Sentry.flush(1000);

      const sentTransactions = transactions(sent);
      expect(sentTransactions).toHaveLength(1);
      expect(sentTransactions[0]).toContain('"description":"redis-get"');
      expect(sentTransactions[0]).not.toContain('leak-child-key');
    });

    it('sends a storage span and breadcrumb without the storage path', async () => {
      const sent = initWith({ SENTRY_DSN: DSN, S3_ENDPOINT: 'http://s3:8333' }, sampleAll);
      const path = `/bucket/keep/users/${['leak', 'user'].join('-')}/a.webp`;

      Sentry.startSpan({ name: 'GET /x', forceTransaction: true }, () => {
        Sentry.startSpan(
          {
            name: `PUT http://s3:8333${path}`,
            attributes: {
              'url.full': `http://s3:8333${path}?x-id=PutObject`,
              'url.path': path,
              'http.request.method': 'PUT',
            },
          },
          () => undefined,
        );
      });
      Sentry.addBreadcrumb({ category: 'http', data: { url: `http://s3:8333${path}` } });
      Sentry.captureException(new Error('after storage'));
      await Sentry.flush(1000);

      const sentTransactions = transactions(sent);
      expect(sentTransactions).toHaveLength(1);
      expect(sentTransactions[0]).toContain('PUT http://s3:8333');
      expect(sent.join('')).not.toContain('leak-user');
      expect(sent.join('')).toContain('after storage');
    });

    it('sends a real outgoing request to the storage without its path or query', async () => {
      // A bare TCP listener, not an http.Server: the SDK would trace the server side of the request
      // too, in this same process, with the path as its transaction name.
      const server = createServer((socket) => {
        socket.on('data', () => {
          socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok');
        });
        socket.on('error', () => undefined);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const { port } = server.address() as AddressInfo;
        const origin = `http://127.0.0.1:${String(port)}`;
        const sent = initWith({ SENTRY_DSN: DSN, S3_ENDPOINT: origin }, sampleAll);

        await Sentry.startSpan({ name: 'GET /x', forceTransaction: true }, async () => {
          await new Promise<void>((resolve, reject) => {
            const request = httpRequest(
              `${origin}/bucket/keep/users/u1/a.webp?prefix=keep%2Fusers%2Fu1%2F`,
              { method: 'PUT' },
              (response) => {
                response.resume();
                response.on('end', resolve);
              },
            );
            request.on('error', reject);
            request.end();
          });
        });
        Sentry.captureException(new Error('after storage'));
        await Sentry.flush(1000);

        const all = sent.join('');
        expect(all).toContain('after storage');
        expect(all).toContain(origin);
        expect(all).not.toContain('keep/users/u1');
        expect(all).not.toContain('keep%2Fusers');
        expect(all).not.toContain('a.webp');
        expect(all).not.toContain('prefix=');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('sends no transaction for a 429', async () => {
      const sent = initWith({ SENTRY_DSN: DSN }, sampleAll);

      runRequest(429, 'agent');
      await Sentry.flush(1000);

      expect(transactions(sent)).toEqual([]);
    });
  });
});
