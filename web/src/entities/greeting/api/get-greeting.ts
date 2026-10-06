import 'server-only';

import { z } from 'zod';

import { apiFetch } from '@/shared/api';

const greetingSchema = z.object({ message: z.string() });

export type Greeting = z.infer<typeof greetingSchema>;

// GET /hello of the api.
export function getGreeting(): Promise<Greeting> {
  return apiFetch('/hello', greetingSchema);
}
