import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProductListQueryDto } from './dto/product-list-query.dto.js';
import { ProductFacetsCache } from './listing/facets-cache.js';
import { encodeProductCursor, type ProductKeyRow } from './listing/product-cursor.js';
import { ProductsService } from './products.service.js';

const idOf = (n: number): string => `0199aaaa-0000-7000-8000-${n.toString().padStart(12, '0')}`;

function keyRow(n: number, fields: Partial<ProductKeyRow> = {}): ProductKeyRow {
  return {
    id: idOf(n),
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 100 - n)),
    price: new Prisma.Decimal(100 + n),
    discount: n,
    rating: new Prisma.Decimal('4.5'),
    ...fields,
  };
}

function productRow(id: string) {
  return {
    id,
    article: `A-${id}`,
    name: `Name ${id}`,
    brand: { id: 'b', name: 'Brand' },
    category: { id: 'c', name: 'Category', slug: 'category' },
    images: [],
    price: new Prisma.Decimal(100),
    discount: 0,
    rating: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

const query = (fields: Partial<ProductListQueryDto> = {}): ProductListQueryDto =>
  ({ sort: 'new', limit: 2, ...fields }) as ProductListQueryDto;

describe('ProductsService.list', () => {
  const queryRaw = vi.fn();
  const findMany = vi.fn();
  let service: ProductsService;

  // The page statements and the count, told apart by their text.
  const isCount = (sql: Prisma.Sql): boolean => sql.sql.includes('count(*)');
  const pages = (): Prisma.Sql[] =>
    queryRaw.mock.calls.map((call) => call[0] as Prisma.Sql).filter((sql) => !isCount(sql));
  const counts = (): Prisma.Sql[] =>
    queryRaw.mock.calls.map((call) => call[0] as Prisma.Sql).filter(isCount);

  function pageRows(...batches: ProductKeyRow[][]): void {
    const queue = [...batches];
    queryRaw.mockImplementation((sql: Prisma.Sql) =>
      Promise.resolve(isCount(sql) ? [{ count: 7 }] : (queue.shift() ?? [])),
    );
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map(productRow)),
    );
    const tx = { $queryRaw: queryRaw, product: { findMany } };
    const module = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: { $transaction: (run: (tx: unknown) => unknown) => run(tx) },
        },
        { provide: ConfigService, useValue: { get: () => 'http://media/' } },
        // The list does not use the facet cache.
        { provide: ProductFacetsCache, useValue: {} },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  it('counts the first batch and gives the cursor of its last item when more follow', async () => {
    pageRows([keyRow(1), keyRow(2), keyRow(3)]);

    const result = await service.list(query());

    expect(result.items.map((item) => item.id)).toEqual([idOf(1), idOf(2)]);
    expect(result.total).toBe(7);
    expect(result.nextCursor).toBe(encodeProductCursor('new', keyRow(2)));
    expect(counts()).toHaveLength(1);
  });

  it('asks for one row more than the limit', async () => {
    pageRows([keyRow(1)]);

    await service.list(query({ limit: 5 }));

    expect(pages()[0]?.values.slice(-2)).toEqual([6, 0]);
  });

  it('has no next cursor when the batch is not past the limit', async () => {
    pageRows([keyRow(1), keyRow(2)]);

    const result = await service.list(query());

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it('answers an empty list with no next cursor', async () => {
    pageRows([]);

    expect(await service.list(query())).toEqual({ items: [], total: 7, nextCursor: null });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('with a cursor runs no count and answers total null', async () => {
    pageRows([keyRow(3), keyRow(4), keyRow(5)]);

    const result = await service.list(query({ cursor: encodeProductCursor('new', keyRow(2)) }));

    expect(counts()).toHaveLength(0);
    expect(result.total).toBeNull();
    expect(result.items.map((item) => item.id)).toEqual([idOf(3), idOf(4)]);
    expect(result.nextCursor).toBe(encodeProductCursor('new', keyRow(4)));
  });

  it('with a cursor on the last batch answers a null next cursor', async () => {
    pageRows([keyRow(3), keyRow(4)]);

    const result = await service.list(query({ cursor: encodeProductCursor('new', keyRow(2)) }));

    expect(result.nextCursor).toBeNull();
    expect(result.total).toBeNull();
  });

  it('throws, and runs no query, when a cursor that passed the DTO does not decode', async () => {
    pageRows([keyRow(1)]);

    await expect(service.list(query({ cursor: '!!!!' }))).rejects.toThrow(
      'A cursor passed the DTO but did not decode',
    );
    expect(queryRaw).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('binds the cursor key and id into the statement, not the text', async () => {
    pageRows([]);

    await service.list(query({ cursor: encodeProductCursor('new', keyRow(2)) }));

    const [sql] = pages();
    expect(sql?.values).toContain(idOf(2));
    expect(sql?.sql).not.toContain(idOf(2));
  });

  it('with an offset counts, pages from the offset and still gives a next cursor', async () => {
    pageRows([keyRow(3), keyRow(4), keyRow(5)]);

    const result = await service.list(query({ offset: 2 }));

    expect(pages()[0]?.values.slice(-2)).toEqual([3, 2]);
    expect(result.total).toBe(7);
    expect(result.nextCursor).toBe(encodeProductCursor('new', keyRow(4)));
  });

  describe('rating', () => {
    const rated = keyRow(1, { rating: new Prisma.Decimal('3.0') });
    const cursor = encodeProductCursor('rating', rated);

    it('goes on to the unrated when the rated rest does not fill the batch', async () => {
      const unrated = [keyRow(8, { rating: null }), keyRow(7, { rating: null })];
      pageRows([keyRow(2, { rating: new Prisma.Decimal('2.0') })], unrated);

      const result = await service.list(query({ sort: 'rating', cursor }));

      expect(pages()).toHaveLength(2);
      expect(pages()[1]?.sql).toContain('p.rating IS NULL');
      // One row past the batch is wanted: 3 in all, 1 found by the first condition.
      expect(pages()[0]?.values.slice(-2)).toEqual([3, 0]);
      expect(pages()[1]?.values.slice(-2)).toEqual([2, 0]);
      expect(result.items.map((item) => item.id)).toEqual([idOf(2), idOf(8)]);
      expect(result.nextCursor).toBe(encodeProductCursor('rating', unrated[0]!));
    });

    it('does not read the unrated when the rated rest fills the batch and one more', async () => {
      pageRows([keyRow(2), keyRow(3), keyRow(4)]);

      const result = await service.list(query({ sort: 'rating', cursor }));

      expect(pages()).toHaveLength(1);
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).not.toBeNull();
    });

    it('ends with no next cursor when both conditions together fill the batch exactly', async () => {
      pageRows([keyRow(2)], [keyRow(8, { rating: null })]);

      const result = await service.list(query({ sort: 'rating', cursor }));

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('with an unrated cursor runs one condition', async () => {
      const unratedCursor = encodeProductCursor('rating', keyRow(9, { rating: null }));
      pageRows([keyRow(5, { rating: null })]);

      const result = await service.list(query({ sort: 'rating', cursor: unratedCursor }));

      expect(pages()).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
      expect(result.total).toBeNull();
    });
  });
});
