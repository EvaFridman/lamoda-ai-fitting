import { z } from 'zod';

import type { RealtimeEvent } from '@/shared/realtime';

// What the push of a finished fitting carries (spec 0019 plan §6): ids and a status, never a link,
// a photo or a text (A35, AC25). It is only a signal to read the fitting again through the api
// (A71): its status is never shown as it came. An extra field is dropped.
const fittingFinishedSchema = z.object({
  generationId: z.uuid(),
  kind: z.enum(['single', 'look']),
  status: z.enum(['completed', 'failed']),
});

export type FittingFinished = z.infer<typeof fittingFinishedSchema>;

// The api sends `fitting:finished` to the room of the fitting's user only. The worker's `notify`
// may publish one twice and both copies of the api push it (A71), so it is delivered once per
// generation; a push web cannot read is dropped, since a lost push costs nothing: the waiting
// screen polls (A44).
export const fittingFinishedEvent: RealtimeEvent<FittingFinished> = {
  name: 'fitting:finished',
  parse: (payload) => {
    const parsed = fittingFinishedSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  },
  key: (push) => push.generationId,
};
