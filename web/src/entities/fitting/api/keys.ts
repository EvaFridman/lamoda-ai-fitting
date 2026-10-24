import type { FittingKind } from '../model/schemas';

// Query keys of the signed-in user's fittings (spec 0019 plan §7). They start with the user's keys
// (`userKeys.all`, `['users']`), so `useDropUserQueries` drops them with the rest of the user's
// data when the session ends (spec 0017 U22). The quota is under `all` too: a push or a change of
// any fitting reads it again (a failed one gives its try-on back).
export const fittingKeys = {
  all: ['users', 'fittings'] as const,
  lists: ['users', 'fittings', 'list'] as const,
  list: (kind?: FittingKind) => ['users', 'fittings', 'list', kind ?? 'all'] as const,
  detail: (id: string) => ['users', 'fittings', 'detail', id] as const,
  quota: ['users', 'fittings', 'quota'] as const,
  // A product's last fitting («Вы это примеряли»): a new result of it changes it too.
  last: (productId: string) => ['users', 'fittings', 'last', productId] as const,
};
