// The signed-in user's fitting room (spec 0019 A12). It starts with the user's keys
// (`userKeys.all`, `['users']`), so `useDropUserQueries` drops it with the rest of the user's data
// when the session ends (spec 0017 U22).
export const fittingRoomKeys = {
  all: ['users', 'fitting-room'] as const,
};
