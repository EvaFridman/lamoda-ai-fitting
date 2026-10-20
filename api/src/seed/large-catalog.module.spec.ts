import { describe, expect, it } from 'vitest';

import { PrismaService, UnlimitedPrismaService } from '../prisma/prisma.service.js';
import { LargeCatalogModule } from './large-catalog.module.js';

describe('LargeCatalogModule', () => {
  // Read from the module's metadata: instantiating a PrismaClient subclass in a unit test overflows
  // the stack in Nest's testing module.
  it('provides the database client without the pool limits under the PrismaService token', () => {
    const providers: unknown[] = Reflect.getMetadata('providers', LargeCatalogModule);

    expect(providers).toContainEqual({ provide: PrismaService, useClass: UnlimitedPrismaService });
    expect(providers).not.toContain(PrismaService);
  });
});
