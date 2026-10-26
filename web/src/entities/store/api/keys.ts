// Query keys shared by the server options and the browser's (`queries.ts`): the same key on both
// sides is what makes the handoff hit. GET /stores takes no parameters, so one list.
export const storeKeys = {
  all: ['stores'] as const,
  list: () => [...storeKeys.all, 'list'] as const,
};
