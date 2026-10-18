import type { IncomingMessage } from 'node:http';

import { type INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as Sentry from '@sentry/nestjs';
import type { Namespace, Server, ServerOptions, Socket } from 'socket.io';
import { Decoder, Encoder } from 'socket.io-parser';

import { providedSessionReader } from '../auth/mount-auth.js';
import { ANONYMOUS, type Principal } from '../common/auth/principal.js';
import { SessionUnavailableError } from '../common/errors/app.exception.js';
import { loggable } from '../common/filters/app-exception.filter.js';
import type { SessionReader } from '../common/http/request-context.js';

// Of the reader's MAX_SESSION_READS (20), at most this many are sockets' at once (N42), so a wave of
// sockets never takes the slots of HTTP requests, which answer 503 without one. With the 5-minute
// cached copy a read takes milliseconds: five keep up with every socket reconnecting after a
// deploy. One more connects as anonymous at once, with a warning.
const MAX_SOCKET_SESSION_READS = 5;
// The interval of warnings about failed reads that are not reported (N44), as Sentry's (N29).
const WARN_INTERVAL_MS = 60_000;

// What the adapter keeps on every socket (`socket.data`), set before the gateway sees it.
export interface SocketData {
  principal: Principal;
}

// Clients may not send binary attachments (spec 0006 F31): each one passes maxHttpBufferSize on its
// own and the parser keeps them until the last arrives, so ten of them would hold ten limits per
// socket. A message that announces any closes the connection. The server's own emits (pushes) go
// through the Encoder and may still carry binary data. maxAttachments needs socket.io-parser 4.2.6.
class NoAttachmentsDecoder extends Decoder {
  constructor() {
    super({ maxAttachments: 0 });
  }
}

// socket.io with the same CORS rule as HTTP (server.ts): only WEB_ORIGIN may connect from a browser.
// A message over maxMessageBytes (SOCKET_MAX_MESSAGE_BYTES) never reaches the gateway (spec 0006
// F8): over WebSocket it closes the connection, over long-polling its request answers 413.
// Gateway decorators cannot read configuration, so the rules are applied here.
//
// Every socket learns its user at the handshake from the same session cookie as HTTP (spec 0013
// plan §7, AC10), through the request context's session reader (one cap on reads in progress, the
// same timeout). A socket without a valid session, or whose read fails, connects as anonymous: the
// connection is never refused for it, and a failure is logged and reported like an HTTP one, except
// that warnings for failures not reported come at most one a minute (N44). The user stays until
// the socket disconnects, even after a sign-out (N36).
export class SocketIoAdapter extends IoAdapter {
  private readonly socketLogger = new Logger(SocketIoAdapter.name);
  private socketSessionReader: SessionReader | undefined;
  // When the last warning about a failed read was logged, and how many were left out since.
  private warnedAt: number | undefined;
  private unwarned = 0;

  constructor(
    private readonly app: INestApplicationContext,
    private readonly origin: string,
    private readonly maxMessageBytes: number,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    // socket.io types every ServerOptions field as required, though the server takes a partial set
    // (its constructor accepts Partial<ServerOptions>); Nest passes only what it overrides.
    const withLimits = {
      ...options,
      cors: { origin: this.origin, credentials: true },
      maxHttpBufferSize: this.maxMessageBytes,
      parser: { Encoder, Decoder: NoAttachmentsDecoder },
      // CORS binds long-polling only: a browser opens a WebSocket from any page. A new connection
      // (either transport) from another site's page is refused with 403 before its session is read
      // (N40). A request without Origin comes from no browser and could send any, so it passes.
      allowRequest: (
        req: IncomingMessage,
        callback: (error: string | null | undefined, success: boolean) => void,
      ) => {
        const { origin } = req.headers;
        callback(null, origin === undefined || origin === this.origin);
      },
    };
    const server: Server = super.createIOServer(port, withLimits as ServerOptions);
    // One share for the adapter: Nest creates a server per port and path, and each must not bring
    // five more slots.
    this.socketSessionReader ??= providedSessionReader(this.app)?.share(MAX_SOCKET_SESSION_READS);
    const identify = this.identify(this.socketSessionReader);
    // A middleware belongs to one namespace: the main one, and any a gateway adds later.
    server.use(identify);
    server.on('new_namespace', (namespace: Namespace) => namespace.use(identify));
    return server;
  }

  private identify(
    readSession: SessionReader | undefined,
  ): (socket: Socket, next: (error?: Error) => void) => void {
    // One read per connection. A namespace's middleware runs on every CONNECT packet, and a client
    // may send any number of them over one open connection, which nginx does not count; reading
    // each would let one connection take every slot of the shared cap and turn HTTP reads into
    // 503s. The sockets of one connection share its handshake request.
    const reads = new WeakMap<IncomingMessage, ReturnType<SessionReader>>();
    return (socket, next) => {
      const data = socket.data as SocketData;
      data.principal = ANONYMOUS;
      if (readSession === undefined) {
        next();
        return;
      }
      const { request } = socket;
      let read = reads.get(request);
      if (read === undefined) {
        read = readSession({ headers: request.headers, path: request.url?.split('?')[0] ?? '' });
        reads.set(request, read);
        // Logged and reported once, by the first socket of the connection.
        read
          .catch((error: unknown) => {
            this.reportFailure(error, socket.id);
          })
          // A report that throws must not become an unhandled rejection, which ends the process.
          .catch(() => undefined);
      }
      read.then(
        (user) => {
          if (user !== undefined) data.principal = { kind: 'user', ...user };
          next();
        },
        () => {
          next();
        },
      );
    };
  }

  private reportFailure(error: unknown, socketId: string): void {
    // The reader keeps one Sentry interval for HTTP and sockets (N29): the failure it marks for
    // reporting is reported here, as AppExceptionFilter reports it, or it is lost.
    const entry = {
      msg: 'The socket connects as anonymous: its session could not be read',
      socketId,
      err: loggable(error),
    };
    if (error instanceof SessionUnavailableError && !error.report) {
      // At most one line per interval, with the number left out since the last one (N44): refused
      // sockets come as fast as nginx lets handshakes through.
      const time = Date.now();
      if (this.warnedAt !== undefined && time - this.warnedAt < WARN_INTERVAL_MS) {
        this.unwarned += 1;
        return;
      }
      this.socketLogger.warn({ ...entry, alsoSinceLastLine: this.unwarned });
      this.warnedAt = time;
      this.unwarned = 0;
    } else {
      this.socketLogger.error(entry);
      Sentry.captureException(error, { tags: { 'error.code': 'SERVICE_UNAVAILABLE' } });
    }
  }
}
