import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';
import { Decoder, Encoder } from 'socket.io-parser';

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
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
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
    };
    return super.createIOServer(port, withLimits as ServerOptions);
  }
}
