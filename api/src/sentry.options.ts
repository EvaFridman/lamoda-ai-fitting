import {
  type ErrorEvent,
  type Event,
  type NodeOptions,
  onUnhandledRejectionIntegration,
} from '@sentry/nestjs';

// Sentry 11 collects user info, cookies, headers (X-Admin-Token among them), query parameters and
// request/response bodies by default; reports from the api carry none of them, as web's
// (web/sentry.options.ts). Also off here: local variables of stack frames and database query data
// (Redis commands carry keys and values), which can hold personal data. The Redis instrumentation
// ignores databaseQueryData: withoutRedisCommands below. Change a field only with a reason in the
// commit.
const dataCollection: NonNullable<NodeOptions['dataCollection']> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  stackFrameVariables: false,
  databaseQueryData: false,
};

// The options of Sentry.init in instrument.ts (spec 0004 E23, E24, E33), apart from it so tests
// can check them without starting the SDK. Reads the environment directly: instrument.ts runs
// before Nest and its validated config exist.
export function sentryOptions(env: NodeJS.ProcessEnv): NodeOptions {
  return {
    // `||`, not `??`: an empty value from compose means off.
    dsn: env.SENTRY_DSN || undefined,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
    // The deployed image tag (the commit), the same release as web's.
    release: env.APP_VERSION,
    // A fixed rate, not inherited from an incoming sentry-trace header: anyone can send that header
    // through nginx and have every request traced, using up the plan's span quota (E33).
    tracesSampler: ({ normalizedRequest }) => (isHealthCheck(normalizedRequest?.url) ? 0 : 0.1),
    // A request's trace goes as one transaction once it ends. Sentry 11's default ("stream") sends
    // spans in batches and never calls beforeSendTransaction, which cleans what is sent.
    traceLifecycle: 'static',
    dataCollection,
    // Console output of libraries would ride along with every later error of the process (the
    // worker has no scope per activity), whatever data it holds.
    beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === 'console' ? null : breadcrumb),
    // Sentry's default ("warn") only logs an unhandled rejection, so a failed start of the server
    // or the worker would leave a process that is alive but does nothing. "strict" reports it and
    // exits, as Node does without Sentry, and the container restarts.
    integrations: [onUnhandledRejectionIntegration({ mode: 'strict' })],
    beforeSend: (event) => withoutRequestData(withoutPrismaMessages(event)),
    beforeSendTransaction: (event) =>
      isThrottled(event) || isRedisCommand(event)
        ? null
        : withoutRedisCommands(withoutUserAgent(withoutRequestData(event))),
  };
}

type TransactionEvent = Parameters<NonNullable<NodeOptions['beforeSendTransaction']>>[0];

// A client over the rate limit gets 429s, and their traces would only spend the span quota.
export function isThrottled(event: TransactionEvent): boolean {
  return event.contexts?.trace?.data?.['http.response.status_code'] === 429;
}

// The http instrumentation writes the User-Agent header to spans whatever dataCollection says;
// AC15 allows no headers.
export function withoutUserAgent(event: TransactionEvent): TransactionEvent {
  delete event.contexts?.trace?.data?.['user_agent.original'];
  for (const span of event.spans ?? []) delete span.data?.['user_agent.original'];
  return event;
}

// The Redis instrumentation writes each command with its keys to the span's query text whatever
// dataCollection says. The rate limiter's keys are hashes of strings that hold the client's
// address, which a search over all IPv4 addresses reverses. Only the command name stays: the span's
// name is set to `redis-<command>`, since other instrumentation paths of the SDK (older ioredis,
// node-redis) name the span after the whole command. A command run outside a request is a
// transaction of its own: isRedisCommand drops it.
export function withoutRedisCommands(event: TransactionEvent): TransactionEvent {
  for (const span of event.spans ?? []) {
    const name = cleanRedisData(span.data);
    if (name) span.description = name;
  }
  return event;
}

// A Redis command run outside a request (a health check, a background job) as a transaction of its
// own: it tells nothing and spends the span quota, and its name, possibly the whole command with
// its keys, is copied into the envelope header when the span starts, out of reach of this hook.
export function isRedisCommand(event: TransactionEvent): boolean {
  const data = event.contexts?.trace?.data;
  return data?.['db.system.name'] === 'redis' || data?.['db.system'] === 'redis';
}

// Drops the command from the attributes of a Redis span and returns the name the span keeps;
// undefined for a span of anything else.
function cleanRedisData(data: Record<string, unknown> | undefined): string | undefined {
  if (data?.['db.system.name'] !== 'redis' && data?.['db.system'] !== 'redis') return undefined;
  delete data['db.query.text'];
  delete data['db.statement'];
  const operation = data['db.operation.name'];
  return typeof operation === 'string' && /^\w+$/.test(operation) ? `redis-${operation}` : 'redis';
}

// Prisma's messages can hold a whole call with its arguments (personal data), as the error log of
// AppExceptionFilter notes: their errors reach Sentry with the type and the stack only.
export function withoutPrismaMessages<T extends ErrorEvent>(event: T): T {
  for (const exception of event.exception?.values ?? []) {
    if (exception.type?.startsWith('PrismaClient')) exception.value = '[removed: may hold data]';
  }
  return event;
}

// A second line behind dataCollection: in Sentry 11 the body is held back when the http
// instrumentation records the request, not when the event is built, so whatever reaches the event
// is dropped here too. The method and the path stay.
export function withoutRequestData<T extends Event>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split('?')[0];
  }
  return event;
}

// Compose polls /health/live every 5 seconds; its traces would fill the plan's span quota (E33).
function isHealthCheck(url: string | undefined): boolean {
  if (!url) return false;
  return new URL(url, 'http://api').pathname.startsWith('/health');
}
