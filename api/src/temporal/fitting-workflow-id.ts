// The id of a try-on's `generateFitting` workflow (spec 0019 plan §4): one per generation, so the
// api's start and its cancellation on a delete (A47) find it by the row's id. No imports: workflow
// code may bundle it too.
export function fittingWorkflowId(generationId: string): string {
  return `fitting-${generationId}`;
}
