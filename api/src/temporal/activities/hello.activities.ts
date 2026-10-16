import { GREETING } from '../../hello/greeting.js';

// Activities do the actual work of a workflow (I/O, databases, external APIs) and run in the normal
// Node environment. Those that need services get them through createActivities (index.ts).
export function createHelloActivities() {
  return {
    async greet(): Promise<string> {
      return GREETING;
    },
  };
}

export type HelloActivities = ReturnType<typeof createHelloActivities>;
