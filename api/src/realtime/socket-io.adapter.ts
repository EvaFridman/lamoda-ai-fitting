import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

// socket.io with the same CORS rule as HTTP (server.ts): only WEB_ORIGIN may connect from a browser.
// Gateway decorators cannot read configuration, so the rule is applied here.
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origin: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    // socket.io types every ServerOptions field as required, though the server takes a partial set
    // (its constructor accepts Partial<ServerOptions>); Nest passes only what it overrides.
    const withCors = { ...options, cors: { origin: this.origin, credentials: true } };
    return super.createIOServer(port, withCors as ServerOptions);
  }
}
