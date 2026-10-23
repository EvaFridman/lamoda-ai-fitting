// Query keys of the signed-in user's photos (spec 0019 plan §7). They start with the user's keys
// (`userKeys.all`, `['users']`), so `useDropUserQueries` drops them with the rest of the user's data
// when the session ends (spec 0017 U22): the next person at the tab never sees them. Not under
// `userKeys.me`, which a refetch of `/me` matches by prefix.
export const userPhotoKeys = {
  all: ['users', 'photos'] as const,
};
