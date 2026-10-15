import 'server-only';

import { z } from 'zod';

import { buildPath } from '@/shared/api';
import { apiFetch } from '@/shared/api/server';

const greetingSchema = z.object({ message: z.string() });

export type Greeting = z.infer<typeof greetingSchema>;

// GET /hello of the api.
export function getGreeting(): Promise<Greeting> {
  return apiFetch(buildPath('/hello'), greetingSchema);
}
