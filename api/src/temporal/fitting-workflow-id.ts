// The id and the time limit of a try-on's `generateFitting` workflow (spec 0019 plan §4). No
// imports: workflow code bundles this file, and the worker reads the limit too.

// One per generation, so the api's start and its cancellation on a delete (A47) find it by the
// row's id.
export function fittingWorkflowId(generationId: string): string {
  return `fitting-${generationId}`;
}

// `generate`'s time above the model's own deadline: reading the inputs from the bucket, sharp and
// the result's write (A68).
export const GENERATE_OVERHEAD_SECONDS = 60;

// `generate`'s startToClose for a model deadline of `timeoutSeconds` (FITTING_TIMEOUT_SECONDS).
// The worker waits this long for running activities when it stops (A69), so a deploy lets a paid
// call end instead of cutting it.
export function generateTimeLimitSeconds(timeoutSeconds: number): number {
  return timeoutSeconds + GENERATE_OVERHEAD_SECONDS;
}
