import 'server-only';

import type { QueryClient, QueryExecuteOptions, QueryKey } from '@tanstack/react-query';

// The server half of the handoff (plan §4): loads one query, a slice's server options
// (`entities/*/server`, `queryFn` through `apiFetch`), into the request's QueryClient, which the page
// then passes to `<HydrationBoundary state={dehydrate(client)}>`, so the browser hook with the same
// key starts with the data and makes no request. Never retried (H10). A failure is returned, not
// thrown, for the page to render its text (`errorText`) and to pass to `reportFailure` (an
// `ApiError` is already reported, anything else is not, H29); the failed query is not dehydrated
// (TanStack dehydrates only successful ones), so the browser hook requests it again.
export async function prefetch<Data, Key extends QueryKey>(
  queryClient: QueryClient,
  options: QueryExecuteOptions<Data, Error, Data, Data, Key>,
): Promise<unknown> {
  try {
    await queryClient.query({ ...options, retry: false });
    return undefined;
  } catch (error) {
    return error;
  }
}
