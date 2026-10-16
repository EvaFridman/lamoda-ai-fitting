import { createServer, type Server, type Socket, connect } from 'node:net';

// A local TCP proxy to a service of the run (the emulator), which a test turns off and on to make
// that service unreachable for one file only: the shared containers keep serving the other files.
// Bytes pass through unchanged, so a signed request stays valid. Close it in `afterAll`.
export interface TcpProxy {
  // `http://127.0.0.1:<port>`: the address to reach the target through the proxy.
  endpoint: string;
  // Drops every open connection and refuses new ones.
  block: () => void;
  unblock: () => void;
  close: () => Promise<void>;
}

export async function startTcpProxy(target: string): Promise<TcpProxy> {
  const { hostname, port } = new URL(target);
  const sockets = new Set<Socket>();
  let blocked = false;

  const server: Server = createServer((client) => {
    if (blocked) {
      client.destroy();
      return;
    }
    const upstream = connect(Number(port), hostname);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      // A dropped side ends the other; the error itself is the point of a blocked proxy.
      socket.on('error', () => {
        client.destroy();
        upstream.destroy();
      });
    }
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The proxy has no TCP address');
  }

  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    block: () => {
      blocked = true;
      for (const socket of sockets) {
        socket.destroy();
      }
    },
    unblock: () => {
      blocked = false;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
