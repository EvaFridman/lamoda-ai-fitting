import 'server-only';

import { headers } from 'next/headers';

import { NONCE_HEADER } from './policy';

/** The nonce `proxy.ts` gave this request, for a script a server component renders. */
export async function requestNonce(): Promise<string | undefined> {
  return (await headers()).get(NONCE_HEADER) ?? undefined;
}
