import { GREETING } from '../../hello/greeting.js';

// Activities do the actual work of a workflow (I/O, databases, external APIs) and run in the normal
// Node environment. Once they need services (Prisma, Redis), createActivities gets them from the
// worker's Nest context.
export function createActivities() {
  return {
    async greet(): Promise<string> {
      return GREETING;
    },
  };
}

export type HelloActivities = ReturnType<typeof createActivities>;
