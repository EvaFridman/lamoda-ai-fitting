'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { signInErrorCode, withoutSignInError } from '../lib/sign-in-error';

export interface SignInErrorParams {
  // The failure's code in the address, or null (`signInErrorCode`).
  code: string | null;
  // The page's query without the failure's params.
  rest: string;
}

// Drops a failed sign-in's `error` and `error_description` from the address (spec 0013 N54), signed
// in or not, so a code left there never opens the login modal later, e.g. after a sign-out.
export function useDropSignInError(): SignInErrorParams {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = signInErrorCode(searchParams);
  const rest = withoutSignInError(searchParams).toString();

  useEffect(() => {
    if (code === null) return;
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [code, rest, pathname, router]);

  return { code, rest };
}
