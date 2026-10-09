import {
  type ErrorEvent,
  type Event,
  type NodeOptions,
  onUnhandledRejectionIntegration,
} from '@sentry/nestjs';

// Sentry 11 collects user info, cookies, headers (X-Admin-Token among them), query parameters and
// request/response bodies by default; reports from the api carry none of them, as web's
// (web/sentry.options.ts). Also off here: local variables of stack frames and database query data
// (Redis commands carry keys and values), which can hold personal data. Change a field only with a
// reason in the commit.
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
      isThrottled(event) ? null : withoutUserAgent(withoutRequestData(event)),
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
