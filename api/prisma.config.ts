import { defineConfig } from 'prisma/config';

// Configuration of the Prisma CLI (generate, migrate). DATABASE_URL comes from the process
// environment, like everything else in the api; `generate` does not need it.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
});
