import { z } from 'zod';

// The pub/sub channel of a finished fitting (spec 0019 plan §6, A44), on the counters' Redis
// (`REDIS_URL`): the worker's `notify` publishes, every api's FittingNotifier pushes it to the
// user's sockets. A channel holds no key, so `noeviction` and the memory limit do not apply.
export const FITTING_EVENTS_CHANNEL = 'fitting-events';

// The socket event and the room of a user's sockets (RealtimeGateway joins them at the handshake).
export const FITTING_FINISHED_EVENT = 'fitting:finished';
export const userRoom = (userId: string): string => `user:${userId}`;

// What the channel carries: the user whose room gets it, plus the push. Only ids and a status
// (A35, AC25): never a link, a key, a photo or a text of the user. Anything else on the channel
// (another publisher of that Redis, a newer shape) is dropped.
const fittingFinishedMessage = z.strictObject({
  userId: z.uuid(),
  generationId: z.uuid(),
  kind: z.enum(['single', 'look']),
  status: z.enum(['completed', 'failed']),
});

export type FittingFinishedMessage = z.infer<typeof fittingFinishedMessage>;
// The push itself: the message without its user.
export type FittingFinishedPush = Omit<FittingFinishedMessage, 'userId'>;

export function parseFittingFinished(raw: string): FittingFinishedMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = fittingFinishedMessage.safeParse(json);
  return parsed.success ? parsed.data : null;
}
