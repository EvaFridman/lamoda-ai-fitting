import { z } from 'zod';

// A page of a list: the api's `Paginated<T>`. The wrapper is not an OpenAPI component, so a list
// schema is checked against its route's response (plan §6).
export function paginatedSchema<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), total: z.number() });
}

// `limit` (1–100, default 60) and `offset` of every list route.
export interface PageQuery {
  limit?: number;
  offset?: number;
}
