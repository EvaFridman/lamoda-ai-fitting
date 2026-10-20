// Query keys of the current user (spec 0017 plan §4).
export const userKeys = {
  all: ['users'] as const,
  me: ['users', 'me'] as const,
};
