import type { NextRequest } from 'next/server';

import { categoryProxy } from '@/_pages/catalog/server';

// Runs before routing, on category pages only: an unknown or inactive slug answers 404 (spec 0014
// O65).
export function proxy(request: NextRequest) {
  return categoryProxy(request);
}

export const config = { matcher: '/catalog/:slug' };
