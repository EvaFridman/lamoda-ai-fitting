import { proxyActivities } from '@temporalio/workflow';

import type { HelloActivities } from '../activities/hello.activities.js';

// Workflow code runs in Temporal's deterministic sandbox: no I/O, no Node or Nest imports, no
// Date.now() or Math.random() of its own. It only orchestrates; activities do the work.
const { greet } = proxyActivities<HelloActivities>({ startToCloseTimeout: '10 seconds' });

export async function hello(): Promise<string> {
  return greet();
}
