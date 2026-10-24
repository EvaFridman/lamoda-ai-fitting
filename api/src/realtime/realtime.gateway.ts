import { SkipThrottle } from '@nestjs/throttler';
import {
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { Public } from '../common/auth/access.decorators.js';
import { type FittingFinishedPush, FITTING_FINISHED_EVENT, userRoom } from './fitting-events.js';
import type { SocketData } from './socket-io.adapter.js';

// socket.io endpoint (path /socket.io; nginx forwards it with the WebSocket upgrade headers).
// Server pushes reach browsers here: a signed-in user's sockets join the room `user:<userId>` at
// the handshake, and FittingNotifier sends a finished fitting there (spec 0019 plan §6). `ping`
// proves the connection works end to end: the reply is the acknowledgement `pong`.
//
// The global TieredThrottlerGuard reads the HTTP request; a socket.io message has none, so the
// guard would fail every message. Its shouldSkip turns this plain @SkipThrottle() into a skip of
// every tier. Rate limiting for socket messages needs its own tracker (the client's
// handshake address) and comes with the first feature that reads client messages (A35).
//
// Global guards run for gateway handlers too: without @Public() the access guard would refuse
// every message. Its handlers stay @Public(): the adapter (socket-io.adapter.ts) puts the socket's
// user in `socket.data.principal`, and a handler that needs one checks it there (spec 0013 plan §7).
@Public()
@SkipThrottle()
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayConnection {
  // Set once the adapter created the server (the app's init).
  @WebSocketServer() private readonly server: Server | undefined;

  // The user is read once, at the handshake, and kept until the socket disconnects (0013 N36,
  // A35); an anonymous socket (no session, a failed read) joins no room and gets no push, as does
  // one of a server without SocketIoAdapter (an e2e app without `socketAdapter`).
  handleConnection(socket: Socket): void {
    const { principal } = socket.data as Partial<SocketData>;
    if (principal?.kind === 'user') {
      void socket.join(userRoom(principal.userId));
    }
  }

  // Sends a finished fitting to every socket of its user on this api; the other copy (blue or
  // green) sends it to its own.
  pushFittingFinished(userId: string, push: FittingFinishedPush): void {
    this.server?.to(userRoom(userId)).emit(FITTING_FINISHED_EVENT, push);
  }

  @SubscribeMessage('ping')
  ping(): string {
    return 'pong';
  }
}
