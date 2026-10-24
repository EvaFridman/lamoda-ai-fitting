import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { OutfitSlot } from '../../src/generated/prisma/enums.js';
import { signIn, type SignedIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

interface ErrorBody {
  error: { code: string; message: string };
}
interface RelatedItem {
  id: string;
}
interface FittingBody {
  id: string;
  status: string;
  parentId: string | null;
  kind: string;
  resultUrl: string | null;
  items: { productId: string }[];
}

let testApp: TestApp;
let counter = 0;
let brandId: string;

beforeAll(async () => {
  testApp = await createTestApp({ access: 'production' });
  brandId = (await testApp.prisma.brand.create({ data: { name: `Brand ${randomUUID()}` } })).id;
}, 120_000);

afterAll(async () => {
  await testApp.close();
});

const next = (): number => ++counter;

async function newCategory(options: { slot: OutfitSlot | null; isActive?: boolean }) {
  const n = next();
  return testApp.prisma.category.create({
    data: {
      name: `Category ${randomUUID()}`,
      slug: `category-${n}-${randomUUID()}`,
      isActive: options.isActive ?? true,
      slot: options.slot,
    },
  });
}

function newProduct(categoryId: string, createdAt?: Date) {
  const n = next();
  return testApp.prisma.product.create({
    data: {
      article: `PP-${n}-${randomUUID()}`,
      name: `Product ${n}`,
      price: '1990.00',
      brandId,
      categoryId,
      ...(createdAt === undefined ? {} : { createdAt }),
    },
  });
}

describe('GET /products/:id/related (spec 0019 T18, A36)', () => {
  // The candidates come from the whole catalog, newest first, and the tests share it: each test
  // dates its rows in a year later than every earlier test's, so only its own are the newest.
  let year = 2200;
  const dated = (offsetMinutes: number): Date => new Date(Date.UTC(year, 0, 1, 0, offsetMinutes));
  const get = (id: string) => request(testApp.app.getHttpServer()).get(`/products/${id}/related`);

  it('answers the six newest products of other categories, newest first, to an anonymous visitor', async () => {
    year += 1;
    const own = await newCategory({ slot: 'top' });
    const other = await newCategory({ slot: 'bottom' });
    const product = await newProduct(own.id, dated(100));
    const made: string[] = [];
    for (let minute = 1; minute <= 8; minute += 1) {
      made.push((await newProduct(other.id, dated(minute))).id);
    }

    const response = await get(product.id).expect(200);

    const body = response.body as RelatedItem[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((item) => item.id)).toEqual(made.slice(2).reverse());
  });

  it('orders products of one moment by id, descending', async () => {
    year += 1;
    const own = await newCategory({ slot: 'top' });
    const other = await newCategory({ slot: 'shoes' });
    const product = await newProduct(own.id, dated(0));
    const first = await newProduct(other.id, dated(5));
    const second = await newProduct(other.id, dated(5));
    const ids = [first.id, second.id].sort().reverse();

    const body = (await get(product.id).expect(200)).body as RelatedItem[];

    expect(body.map((item) => item.id).slice(0, 2)).toEqual(ids);
  });

  it('leaves out the product itself and its category', async () => {
    year += 1;
    const own = await newCategory({ slot: 'top' });
    const other = await newCategory({ slot: 'bottom' });
    const product = await newProduct(own.id, dated(50));
    const sibling = await newProduct(own.id, dated(60));
    const wanted = await newProduct(other.id, dated(1));

    const ids = ((await get(product.id).expect(200)).body as RelatedItem[]).map((item) => item.id);

    expect(ids).toContain(wanted.id);
    expect(ids).not.toContain(product.id);
    expect(ids).not.toContain(sibling.id);
  });

  it('leaves out inactive categories and categories with no slot', async () => {
    year += 1;
    const own = await newCategory({ slot: 'top' });
    const inactive = await newCategory({ slot: 'bottom', isActive: false });
    const noSlot = await newCategory({ slot: null });
    const good = await newCategory({ slot: 'shoes' });
    const product = await newProduct(own.id, dated(0));
    const hiddenA = await newProduct(inactive.id, dated(30));
    const hiddenB = await newProduct(noSlot.id, dated(31));
    const shown = await newProduct(good.id, dated(1));

    const ids = ((await get(product.id).expect(200)).body as RelatedItem[]).map((item) => item.id);

    expect(ids).toContain(shown.id);
    expect(ids).not.toContain(hiddenA.id);
    expect(ids).not.toContain(hiddenB.id);
  });

  it('still answers for a product whose own category has no slot', async () => {
    year += 1;
    const own = await newCategory({ slot: null });
    const other = await newCategory({ slot: 'outerwear' });
    const product = await newProduct(own.id, dated(40));
    const shown = await newProduct(other.id, dated(1));

    const body = (await get(product.id).expect(200)).body as RelatedItem[];

    expect(body.map((item) => item.id)[0]).toBe(shown.id);
  });

  it('answers the list item shape of GET /products', async () => {
    year += 1;
    const own = await newCategory({ slot: 'top' });
    const other = await newCategory({ slot: 'bottom' });
    const product = await newProduct(own.id, dated(0));
    const shown = await newProduct(other.id, dated(1));

    const body = (await get(product.id).expect(200)).body as { id: string; name: string }[];

    expect(body[0]).toMatchObject({ id: shown.id, name: shown.name });
  });

  it('answers 404 NOT_FOUND for an unknown product', async () => {
    const response = await get(randomUUID()).expect(404);

    expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('answers 404 for a product of an inactive category', async () => {
    const inactive = await newCategory({ slot: 'top', isActive: false });
    const product = await newProduct(inactive.id);

    const response = await get(product.id).expect(404);

    expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('answers 400 for an id that is not a uuid', async () => {
    const response = await get('not-a-uuid').expect(400);

    expect((response.body as ErrorBody).error.code).toBe('INVALID_ID');
  });
});

describe('GET /products/:id/fittings/last (spec 0019 T18, AC24)', () => {
  const get = (id: string, user?: SignedIn) => {
    const call = request(testApp.app.getHttpServer()).get(`/products/${id}/fittings/last`);
    return user === undefined ? call : call.set('Cookie', user.cookie);
  };

  async function newUserSession() {
    const user = await signIn(testApp.app);
    const session = await testApp.prisma.fittingSession.create({ data: { userId: user.userId } });
    return { user, sessionId: session.id };
  }

  async function newProductOfSlot(slot: OutfitSlot = 'top') {
    const category = await newCategory({ slot });
    return newProduct(category.id);
  }

  interface FittingOptions {
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    kind?: 'single' | 'look' | null;
    createdAt?: Date;
    parentId?: string;
  }

  async function newFitting(
    owner: { user: SignedIn; sessionId: string },
    productIds: string[],
    options: FittingOptions = {},
  ) {
    const status = options.status ?? 'completed';
    const id = randomUUID();
    const row = await testApp.prisma.aiGeneration.create({
      data: {
        id,
        sessionId: owner.sessionId,
        userId: owner.user.userId,
        userImageKey: `keep/users/${owner.user.userId}/generations/${id}/input.webp`,
        status,
        resultImageKey:
          status === 'completed'
            ? `keep/users/${owner.user.userId}/generations/${id}/result.webp`
            : null,
        errorMessage: status === 'failed' ? 'provider timeout' : null,
        aiProvider: 'test-provider',
        aiModel: 'test-model',
        kind: options.kind === undefined ? 'single' : options.kind,
        ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
        ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
      },
    });
    await testApp.prisma.generationProduct.createMany({
      data: productIds.map((productId) => ({ generationId: row.id, productId })),
    });
    return row;
  }

  it('answers the completed fitting of the product with its signed result link', async () => {
    const owner = await newUserSession();
    const product = await newProductOfSlot();
    const fitting = await newFitting(owner, [product.id]);

    const response = await get(product.id, owner.user).expect(200);

    const body = response.body as FittingBody;
    expect(body).toMatchObject({ id: fitting.id, status: 'completed', kind: 'single' });
    expect(body.items.map((item) => item.productId)).toEqual([product.id]);
    expect(body.resultUrl).toContain(`keep/users/${owner.user.userId}/generations/${fitting.id}/`);
    expect(body.resultUrl).toContain('X-Amz-Signature');
  });

  it('answers the newest of several by creation time', async () => {
    const owner = await newUserSession();
    const product = await newProductOfSlot();
    await newFitting(owner, [product.id], { createdAt: new Date('2031-01-01T00:00:00Z') });
    const newest = await newFitting(owner, [product.id], {
      createdAt: new Date('2031-03-01T00:00:00Z'),
    });
    await newFitting(owner, [product.id], { createdAt: new Date('2031-02-01T00:00:00Z') });

    const body = (await get(product.id, owner.user).expect(200)).body as FittingBody;

    expect(body.id).toBe(newest.id);
  });

  it('answers the one with the higher id when two share a moment', async () => {
    const owner = await newUserSession();
    const product = await newProductOfSlot();
    const moment = new Date('2032-01-01T00:00:00Z');
    const a = await newFitting(owner, [product.id], { createdAt: moment });
    const b = await newFitting(owner, [product.id], { createdAt: moment });
    const higher = [a.id, b.id].sort().at(-1);

    const body = (await get(product.id, owner.user).expect(200)).body as FittingBody;

    expect(body.id).toBe(higher);
  });

  it('answers a newer regeneration of a look that holds the product over an older single', async () => {
    const owner = await newUserSession();
    const product = await newProductOfSlot('top');
    const other = await newProductOfSlot('bottom');
    const single = await newFitting(owner, [product.id], {
      createdAt: new Date('2033-01-01T00:00:00Z'),
    });
    const look = await newFitting(owner, [product.id, other.id], {
      kind: 'look',
      createdAt: new Date('2033-02-01T00:00:00Z'),
    });
    const regeneration = await newFitting(owner, [product.id, other.id], {
      kind: 'look',
      parentId: look.id,
      createdAt: new Date('2033-03-01T00:00:00Z'),
    });
    expect(single.id).not.toBe(regeneration.id);

    const body = (await get(product.id, owner.user).expect(200)).body as FittingBody;

    expect(body).toMatchObject({ id: regeneration.id, kind: 'look', parentId: look.id });
    expect(body.items.map((item) => item.productId).sort()).toEqual([product.id, other.id].sort());
  });

  it('answers 404 for a product never tried on', async () => {
    const owner = await newUserSession();
    const product = await newProductOfSlot();

    const response = await get(product.id, owner.user).expect(404);

    expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('answers 404 when the product is only in fittings of other products', async () => {
    const owner = await newUserSession();
    const product = await newProductOfSlot();
    const other = await newProductOfSlot();
    await newFitting(owner, [other.id]);

    await get(product.id, owner.user).expect(404);
  });

  it.each(['pending', 'processing', 'failed'] as const)(
    'answers 404 when the only fitting is %s',
    async (status) => {
      const owner = await newUserSession();
      const product = await newProductOfSlot();
      await newFitting(owner, [product.id], { status });

      await get(product.id, owner.user).expect(404);
    },
  );

  it('skips an unfinished newer fitting for an older completed one', async () => {
    const owner = await newUserSession();
    const product = await newProductOfSlot();
    const done = await newFitting(owner, [product.id], {
      createdAt: new Date('2034-01-01T00:00:00Z'),
    });
    await newFitting(owner, [product.id], {
      status: 'failed',
      createdAt: new Date('2034-02-01T00:00:00Z'),
    });

    const body = (await get(product.id, owner.user).expect(200)).body as FittingBody;

    expect(body.id).toBe(done.id);
  });

  it('answers 404 when the only fitting has no kind (the closed route’s rows)', async () => {
    const owner = await newUserSession();
    const product = await newProductOfSlot();
    await newFitting(owner, [product.id], { kind: null });

    await get(product.id, owner.user).expect(404);
  });

  it('answers 404 for a product only another user tried on', async () => {
    const owner = await newUserSession();
    const stranger = await newUserSession();
    const product = await newProductOfSlot();
    await newFitting(owner, [product.id]);

    await get(product.id, stranger.user).expect(404);
  });

  it('answers 404 for an unknown product', async () => {
    const owner = await newUserSession();

    const response = await get(randomUUID(), owner.user).expect(404);

    expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('answers 401 to an anonymous visitor', async () => {
    const product = await newProductOfSlot();

    const response = await get(product.id).expect(401);

    expect((response.body as ErrorBody).error.code).toBe('UNAUTHORIZED');
  });

  it('answers 400 for an id that is not a uuid', async () => {
    const owner = await newUserSession();

    const response = await get('not-a-uuid', owner.user).expect(400);

    expect((response.body as ErrorBody).error.code).toBe('INVALID_ID');
  });
});
