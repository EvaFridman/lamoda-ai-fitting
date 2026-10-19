import { z } from 'zod';

// The answer of /api/auth/get-session with a session (Better Auth's; without one it is null). Only
// what web shows: the user's id, email and given name, which is empty when Google's did not pass
// the name rule (spec 0013 N5). The rest of the answer, the session's token too, is dropped.
export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
});

export const sessionSchema = z.object({ user: sessionUserSchema });

export type SessionUser = z.infer<typeof sessionUserSchema>;
export type Session = z.infer<typeof sessionSchema>;
