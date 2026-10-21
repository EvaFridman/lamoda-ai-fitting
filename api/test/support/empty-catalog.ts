// A stand-in for PrismaService in e2e that run without a database: `GET /categories` reads an empty
// catalog, so these tests have an ordinary public read route (spec 0014 O33). Any other query
// fails, as the stand-in has no other method.
export function emptyCatalogPrisma() {
  return {
    category: { findMany: async () => [], count: async () => 0 },
    $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  };
}
