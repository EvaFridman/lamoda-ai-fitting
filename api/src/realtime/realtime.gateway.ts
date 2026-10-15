import { SkipThrottle } from '@nestjs/throttler';
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';

import { Public } from '../common/auth/access.decorators.js';

// socket.io endpoint (path /socket.io; nginx forwards it with the WebSocket upgrade headers).
// The place where server events (@nestjs/event-emitter) will reach browsers. For now only `ping`,
// which proves the connection works end to end: the reply is the acknowledgement `pong`.
//
// The global ThrottlerGuard reads the HTTP request; a socket.io message has none, so the guard
// would fail every message. Rate limiting for socket messages needs its own tracker (the client's
// handshake address) and comes with the first real socket feature.
//
// Global guards run for gateway handlers too: without @Public() the access guard would refuse
// every message. Sockets carry no auth yet (spec 0006 non-goals).
@Public()
@SkipThrottle()
@WebSocketGateway()
export class RealtimeGateway {
  @SubscribeMessage('ping')
  ping(): string {
    return 'pong';
  }
}
