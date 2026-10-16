import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generationInputKey, generationResultKey } from '../../src/storage/keys.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';

interface GenerationBody {
  id: string;
  sessionId: string;
  productIds: string[];
  userImageKey: string;
  resultImageKey: string | null;
  userImageUrl: string;
  resultImageUrl: string | null;
  status: string;
  aiProvider: string;
  aiModel: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

const RESPONSE_KEYS = [
  'aiModel',
  'aiProvider',
  'createdAt',
  'errorMessage',
  'id',
  'productIds',
  'resultImageKey',
  'resultImageUrl',
  'sessionId',
  'status',
  'updatedAt',
  'userImageKey',
  'userImageUrl',
];

// A signed link changes with the second it is signed in: two responses are equal up to the query.
function stable(generation: unknown): unknown {
  const body = generation as GenerationBody;
  return {
    ...body,
    userImageUrl: body.userImageUrl.split('?')[0],
    resultImageUrl: body.resultImageUrl?.split('?')[0] ?? null,
  };
}

let testApp: TestApp;
let counter = 0;
let brandId: string;
let categoryId: string;

beforeAll(async () => {
  testApp = await createTestApp();
  brandId = (await testApp.prisma.brand.create({ data: { name: 'Generations brand' } })).id;
  categoryId = (
    await testApp.prisma.category.create({
      data: { name: 'Generations category', slug: 'generations-category', isActive: true },
    })
  ).id;
});

afterAll(async () => {
  await testApp.close();
});

const http = () => request(testApp.app.getHttpServer());
const admin = { 'X-Admin-Token': ADMIN_TOKEN };

function next(): number {
  counter += 1;
  return counter;
}

const owners = new Map<string, string>();

async function createSession(): Promise<string> {
  const n = String(next()).padStart(9, '0');
  const user = await testApp.prisma.user.create({
    data: { phone: `+79${n}`.slice(0, 12), email: `gen${n}@mail.ru`, firstName: 'Анна' },
  });
  const session = await testApp.prisma.fittingSession.create({ data: { userId: user.id } });
  owners.set(session.id, user.id);
  return session.id;
}

// The keys a write to this session may carry: in the folder of the session's user.
function inputKey(sessionId: string): string {
  return generationInputKey(owners.get(sessionId) ?? randomUUID(), randomUUID());
}

function resultKey(sessionId: string): string {
  return generationResultKey(owners.get(sessionId) ?? randomUUID(), randomUUID());
}

async function createProducts(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const product = await testApp.prisma.product.create({
      data: { article: `gen-art-${next()}`, name: 'Платье', price: 100, brandId, categoryId },
    });
    ids.push(product.id);
  }
  return ids;
}

function body(sessionId: string, productIds: string[], extra: Record<string, unknown> = {}) {
  return {
    sessionId,
    productIds,
    userImageKey: inputKey(sessionId),
    status: 'pending',
    aiProvider: 'openai',
    aiModel: 'gpt-image-1',
    ...extra,
  };
}

async function post(payload: Record<string, unknown>): Promise<request.Response> {
  return http().post('/ai-generations').set(admin).send(payload);
}

async function patch(id: string, payload: Record<string, unknown>): Promise<request.Response> {
  return http().patch(`/ai-generations/${id}`).set(admin).send(payload);
}

async function get(id: string): Promise<request.Response> {
  return http().get(`/ai-generations/${id}`).set(admin);
}

async function create(
  sessionId: string,
  productIds: string[],
  extra: Record<string, unknown> = {},
): Promise<GenerationBody> {
  const response = await post(body(sessionId, productIds, extra));
  expect(response.status).toBe(201);
  return response.body as GenerationBody;
}

async function links(generationId: string): Promise<string[]> {
  const rows = await testApp.prisma.generationProduct.findMany({
    where: { generationId },
    orderBy: { productId: 'asc' },
  });
  return rows.map((row) => row.productId);
}

function generationCount(sessionId: string): Promise<number> {
  return testApp.prisma.aiGeneration.count({ where: { sessionId } });
}

function expectError(
  response: request.Response,
  status: number,
  code: string,
  field?: string,
): void {
  expect(response.status).toBe(status);
  const { error } = response.body as {
    error: { code: string; details: { field: string; code: string }[] };
  };
  expect(error.code).toBe(code);
  if (field !== undefined) {
    expect(error.details.map((detail) => detail.field)).toContain(field);
  }
}

describe('ai generations: access', () => {
  it('refuses every route without a token with 401 UNAUTHORIZED', async () => {
    const sessionId = await createSession();
    const [productId] = await createProducts(1);
    const generation = await create(sessionId, [productId ?? '']);

    expectError(await http().get('/ai-generations'), 401, 'UNAUTHORIZED');
    expectError(await http().get(`/ai-generations/${generation.id}`), 401, 'UNAUTHORIZED');
    expectError(
      await http()
        .post('/ai-generations')
        .send(body(sessionId, [productId ?? ''])),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      await http().patch(`/ai-generations/${generation.id}`).send({ aiModel: 'x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete(`/ai-generations/${generation.id}`), 401, 'UNAUTHORIZED');
    expect(await generationCount(sessionId)).toBe(1);
  });

  it('refuses a wrong token and answers 401 before validation', async () => {
    expectError(
      await http().get('/ai-generations').set({ 'X-Admin-Token': 'wrong' }),
      401,
      'UNAUTHORIZED',
    );
    const response = await http().post('/ai-generations').send({ bad: 1 });
    expectError(response, 401, 'UNAUTHORIZED');
    expect((response.body as { error: { details: unknown[] } }).error.details).toEqual([]);
  });
});

describe('ai generations: create, read, update, delete (AC2)', () => {
  it('creates with 201 and returns own columns and sorted productIds', async () => {
    const sessionId = await createSession();
    const products = await createProducts(3);
    const shuffled = [products[2], products[0], products[1]] as string[];

    const response = await post(body(sessionId, shuffled));

    expect(response.status).toBe(201);
    const created = response.body as GenerationBody;
    expect(Object.keys(created).sort()).toEqual(RESPONSE_KEYS);
    expect(created).toMatchObject({
      sessionId,
      status: 'pending',
      userImageKey: expect.stringMatching(/^keep\/users\//) as unknown,
      aiProvider: 'openai',
      aiModel: 'gpt-image-1',
      resultImageKey: null,
      resultImageUrl: null,
      userImageUrl: expect.stringContaining(created.userImageKey) as unknown,
      errorMessage: null,
    });
    expect(created.productIds).toEqual([...products].sort());
    expect(await links(created.id)).toEqual([...products].sort());
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(created.updatedAt))).toBe(false);
  });

  it('reads one by id with 200, equal to the create response', async () => {
    const generation = await create(await createSession(), await createProducts(2));

    const response = await get(generation.id);

    expect(response.status).toBe(200);
    expect(stable(response.body)).toEqual(stable(generation));
  });

  it('updates fields with 200 and keeps the links when productIds is left out', async () => {
    const products = await createProducts(2);
    const generation = await create(await createSession(), products);

    const response = await patch(generation.id, { status: 'processing', aiModel: 'other' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: generation.id,
      status: 'processing',
      aiModel: 'other',
      productIds: [...products].sort(),
    });
    expect(await links(generation.id)).toEqual([...products].sort());
  });

  it('deletes with 204, removes the links and answers 404 afterwards', async () => {
    const generation = await create(await createSession(), await createProducts(2));

    const response = await http().delete(`/ai-generations/${generation.id}`).set(admin);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(await links(generation.id)).toEqual([]);
    expectError(await get(generation.id), 404, 'NOT_FOUND');
  });

  it('answers 404 NOT_FOUND for an unknown id on get, patch (also empty) and delete', async () => {
    const id = randomUUID();

    expectError(await get(id), 404, 'NOT_FOUND');
    expectError(await patch(id, { aiModel: 'x' }), 404, 'NOT_FOUND');
    expectError(await patch(id, {}), 404, 'NOT_FOUND');
    expectError(await http().delete(`/ai-generations/${id}`).set(admin), 404, 'NOT_FOUND');
  });

  it('answers 400 INVALID_ID for a malformed id on every id route', async () => {
    expectError(await get('not-a-uuid'), 400, 'INVALID_ID');
    expectError(await patch('not-a-uuid', { aiModel: 'x' }), 400, 'INVALID_ID');
    expectError(await http().delete('/ai-generations/not-a-uuid').set(admin), 400, 'INVALID_ID');
  });

  it('answers 200 with the record unchanged, updatedAt included, for an empty PATCH', async () => {
    const generation = await create(await createSession(), await createProducts(1));

    const response = await patch(generation.id, {});

    expect(response.status).toBe(200);
    expect(stable(response.body)).toEqual(stable(generation));
  });

  it('accepts upper-case product ids and stores them lower-case', async () => {
    const products = await createProducts(2);

    const generation = await create(
      await createSession(),
      products.map((id) => id.toUpperCase()),
    );

    expect(generation.productIds).toEqual([...products].sort());
    expect(await links(generation.id)).toEqual([...products].sort());
  });

  it('accepts 20 products', async () => {
    const products = await createProducts(20);

    const generation = await create(await createSession(), products);

    expect(generation.productIds).toHaveLength(20);
  });
});

describe('ai generations: status, result and error (E54, AC9)', () => {
  it('creates completed with a result and failed with an error', async () => {
    const sessionId = await createSession();
    const products = await createProducts(1);

    const doneKey = resultKey(sessionId);
    const partialKey = resultKey(sessionId);
    const done = await create(sessionId, products, {
      status: 'completed',
      resultImageKey: doneKey,
    });
    const failed = await create(sessionId, products, {
      status: 'failed',
      errorMessage: 'PROVIDER_TIMEOUT',
      resultImageKey: partialKey,
    });

    expect(done).toMatchObject({ resultImageKey: doneKey, errorMessage: null });
    expect(failed).toMatchObject({
      errorMessage: 'PROVIDER_TIMEOUT',
      resultImageKey: partialKey,
    });
  });

  it.each([
    ['pending with a result', { status: 'pending', resultImageKey: 'a/b.jpg' }, 'resultImageKey'],
    ['processing with an error', { status: 'processing', errorMessage: 'x' }, 'errorMessage'],
    ['completed with no result', { status: 'completed' }, 'resultImageKey'],
    [
      'completed with an error',
      { status: 'completed', resultImageKey: 'a/b.jpg', errorMessage: 'x' },
      'errorMessage',
    ],
    ['failed with no error', { status: 'failed' }, 'errorMessage'],
    ['failed with a null error', { status: 'failed', errorMessage: null }, 'errorMessage'],
  ])('refuses %s on create with 400 and writes no row', async (_label, extra, field) => {
    const sessionId = await createSession();
    const products = await createProducts(1);

    const response = await post(body(sessionId, products, extra));

    expectError(response, 400, 'VALIDATION_FAILED', field);
    const details = (response.body as { error: { details: { field: string; code: string }[] } })
      .error.details;
    expect(details.find((detail) => detail.field === field)?.code).toBe('MATCHES_STATUS');
    expect(await generationCount(sessionId)).toBe(0);
    expect(
      await testApp.prisma.generationProduct.count({ where: { productId: products[0] } }),
    ).toBe(0);
  });

  it('checks the stored row merged with the body on update', async () => {
    const generation = await create(await createSession(), await createProducts(1), {
      status: 'failed',
      errorMessage: 'PROVIDER_TIMEOUT',
    });
    const stored = await testApp.prisma.aiGeneration.findUniqueOrThrow({
      where: { id: generation.id },
    });
    const key = resultKey(generation.sessionId);

    const refused = await patch(generation.id, {
      status: 'completed',
      resultImageKey: key,
    });

    expectError(refused, 400, 'VALIDATION_FAILED', 'errorMessage');
    expect(
      await testApp.prisma.aiGeneration.findUniqueOrThrow({ where: { id: generation.id } }),
    ).toEqual(stored);

    const accepted = await patch(generation.id, {
      status: 'completed',
      resultImageKey: key,
      errorMessage: null,
    });

    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      status: 'completed',
      resultImageKey: key,
      errorMessage: null,
    });
  });

  it('refuses a status change alone that breaks the stored triple', async () => {
    const generation = await create(await createSession(), await createProducts(1));

    expectError(
      await patch(generation.id, { status: 'completed' }),
      400,
      'VALIDATION_FAILED',
      'resultImageKey',
    );
    expectError(
      await patch(generation.id, { status: 'failed' }),
      400,
      'VALIDATION_FAILED',
      'errorMessage',
    );
    expect(stable((await get(generation.id)).body)).toEqual(stable(generation));
  });

  it('clears the result with null when the status allows it', async () => {
    const sessionId = await createSession();
    const generation = await create(sessionId, await createProducts(1), {
      status: 'completed',
      resultImageKey: resultKey(sessionId),
    });

    const response = await patch(generation.id, { status: 'pending', resultImageKey: null });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'pending',
      resultImageKey: null,
      resultImageUrl: null,
    });
  });
});

describe('ai generations: product links', () => {
  it('replaces all links when productIds is sent', async () => {
    const products = await createProducts(3);
    const generation = await create(await createSession(), [products[0] as string]);

    const response = await patch(generation.id, {
      productIds: [products[1], products[2]],
    });

    expect(response.status).toBe(200);
    expect((response.body as GenerationBody).productIds).toEqual([products[1], products[2]].sort());
    expect(await links(generation.id)).toEqual([products[1], products[2]].sort());
  });

  it('replaces the links with upper-case ids sent in a PATCH', async () => {
    const products = await createProducts(2);
    const generation = await create(await createSession(), [products[0] as string]);

    const response = await patch(generation.id, {
      productIds: [(products[1] as string).toUpperCase()],
    });

    expect(response.status).toBe(200);
    expect(await links(generation.id)).toEqual([products[1]]);
  });

  it('leaves the links unchanged when the update names a missing product', async () => {
    const products = await createProducts(2);
    const generation = await create(await createSession(), products);

    const response = await patch(generation.id, {
      productIds: [randomUUID()],
      aiModel: 'changed',
    });

    expectError(response, 400, 'RELATED_NOT_FOUND', 'productIds');
    expect(await links(generation.id)).toEqual([...products].sort());
    expect(stable((await get(generation.id)).body)).toEqual(stable(generation));
  });

  it('leaves the links unchanged when the update breaks the triple', async () => {
    const products = await createProducts(2);
    const other = await createProducts(1);
    const generation = await create(await createSession(), products);

    const response = await patch(generation.id, { productIds: other, status: 'completed' });

    expectError(response, 400, 'VALIDATION_FAILED', 'resultImageKey');
    expect(await links(generation.id)).toEqual([...products].sort());
    expect(stable((await get(generation.id)).body)).toEqual(stable(generation));
  });

  it('answers 400 RELATED_NOT_FOUND on sessionId for a missing session and writes nothing', async () => {
    const products = await createProducts(1);

    const response = await post(body(randomUUID(), products));

    expectError(response, 400, 'RELATED_NOT_FOUND', 'sessionId');
    expect(
      await testApp.prisma.generationProduct.count({ where: { productId: products[0] } }),
    ).toBe(0);
  });

  it('answers 400 RELATED_NOT_FOUND on productIds for a missing product and writes no row', async () => {
    const sessionId = await createSession();
    const [existing] = await createProducts(1);

    const response = await post(body(sessionId, [existing as string, randomUUID()]));

    expectError(response, 400, 'RELATED_NOT_FOUND', 'productIds');
    expect(await generationCount(sessionId)).toBe(0);
  });

  it('refuses duplicate product ids, also differing by letter case', async () => {
    const sessionId = await createSession();
    const [id] = await createProducts(1);

    expectError(
      await post(body(sessionId, [id as string, id as string])),
      400,
      'VALIDATION_FAILED',
      'productIds',
    );
    expectError(
      await post(body(sessionId, [id as string, (id as string).toUpperCase()])),
      400,
      'VALIDATION_FAILED',
      'productIds',
    );
    expect(await generationCount(sessionId)).toBe(0);
  });

  it('refuses to delete a product used in a generation with 409 IN_USE', async () => {
    const [productId] = await createProducts(1);
    const generation = await create(await createSession(), [productId as string]);

    const response = await http().delete(`/products/${productId}`).set(admin);

    expectError(response, 409, 'IN_USE');
    expect(await links(generation.id)).toEqual([productId]);
  });

  it('deletes the generations and links with the session', async () => {
    const sessionId = await createSession();
    const generation = await create(sessionId, await createProducts(2));

    await testApp.prisma.fittingSession.delete({ where: { id: sessionId } });

    expect(await generationCount(sessionId)).toBe(0);
    expect(await links(generation.id)).toEqual([]);
  });
});

describe('ai generations: parallel link updates', () => {
  const RACE_ROUNDS = 8;

  it('leaves exactly one of the sent sets after parallel PATCHes of productIds', async () => {
    const pool = await createProducts(6);
    const [a, b, c, d, e, f] = pool as [string, string, string, string, string, string];
    const sets = [[a, b], [c, d], [b, c, e], [a, f], [d]];

    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const generation = await create(await createSession(), [a]);

      const responses = await Promise.all(
        sets.map((productIds) => patch(generation.id, { productIds })),
      );

      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect((response.body as GenerationBody).productIds).toEqual(
          [...(sets[index] as string[])].sort(),
        );
      });
      const finalLinks = await links(generation.id);
      expect(sets.map((set) => [...set].sort())).toContainEqual(finalLinks);
      expect((await get(generation.id)).body).toMatchObject({ productIds: finalLinks });
    }
  });

  it('changes updatedAt on a PATCH of productIds only and answers the new links', async () => {
    const [first, second] = await createProducts(2);
    const generation = await create(await createSession(), [first as string]);

    const response = await patch(generation.id, { productIds: [second as string] });

    expect(response.status).toBe(200);
    const updated = response.body as GenerationBody;
    expect(updated.productIds).toEqual([second]);
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(generation.updatedAt));
    expect(updated.createdAt).toBe(generation.createdAt);
    expect(await links(generation.id)).toEqual([second]);
  });
});

describe('ai generations: validation', () => {
  it('refuses a missing or invalid productIds on create', async () => {
    const sessionId = await createSession();
    const payload = body(sessionId, []);
    delete (payload as Partial<typeof payload>).productIds;

    expectError(await post(payload), 400, 'VALIDATION_FAILED', 'productIds');
    expectError(await post(body(sessionId, [])), 400, 'VALIDATION_FAILED', 'productIds');
    expectError(
      await post(
        body(
          sessionId,
          Array.from({ length: 21 }, () => randomUUID()),
        ),
      ),
      400,
      'VALIDATION_FAILED',
      'productIds',
    );
    expect(await generationCount(sessionId)).toBe(0);
  });

  it('refuses null and empty productIds and sessionId on update', async () => {
    const generation = await create(await createSession(), await createProducts(1));

    expectError(
      await patch(generation.id, { productIds: null }),
      400,
      'VALIDATION_FAILED',
      'productIds',
    );
    expectError(
      await patch(generation.id, { productIds: [] }),
      400,
      'VALIDATION_FAILED',
      'productIds',
    );
    expectError(
      await patch(generation.id, { sessionId: randomUUID() }),
      400,
      'VALIDATION_FAILED',
      'sessionId',
    );
    expect(stable((await get(generation.id)).body)).toEqual(stable(generation));
  });

  it.each(['status', 'aiProvider', 'aiModel', 'userImageKey'])(
    'refuses null %s on update',
    async (field) => {
      const generation = await create(await createSession(), await createProducts(1));

      expectError(await patch(generation.id, { [field]: null }), 400, 'VALIDATION_FAILED', field);
      expect(stable((await get(generation.id)).body)).toEqual(stable(generation));
    },
  );

  it.each([
    ['aiProvider', ' openai'],
    ['aiProvider', 'a'.repeat(51)],
    ['aiModel', ''],
    ['errorMessage', 'e'.repeat(1001)],
    ['errorMessage', 'Пла\u0000'],
    ['userImageKey', '../x.jpg'],
    ['userImageKey', 'a'.repeat(256)],
    ['resultImageKey', '/abs.jpg'],
    ['status', 'done'],
  ])('refuses %s = %j on create', async (field, value) => {
    const sessionId = await createSession();
    const products = await createProducts(1);

    expectError(
      await post(body(sessionId, products, { [field]: value })),
      400,
      'VALIDATION_FAILED',
      field,
    );
    expect(await generationCount(sessionId)).toBe(0);
  });

  it('accepts the longest values', async () => {
    const sessionId = await createSession();
    const owner = owners.get(sessionId) as string;
    const shortest = generationInputKey(owner, 'x');
    const userImageKey = generationInputKey(owner, 'x'.repeat(255 - shortest.length + 1));
    expect(userImageKey).toHaveLength(255);

    const generation = await create(sessionId, await createProducts(1), {
      status: 'failed',
      aiProvider: 'p'.repeat(50),
      aiModel: 'm'.repeat(50),
      errorMessage: 'e'.repeat(1000),
      userImageKey,
    });

    expect(generation.errorMessage).toHaveLength(1000);
    expect(generation.userImageKey).toHaveLength(255);
  });

  it('refuses an unknown field', async () => {
    const generation = await create(await createSession(), await createProducts(1));

    expectError(
      await patch(generation.id, { createdAt: '2020-01-01T00:00:00Z' }),
      400,
      'VALIDATION_FAILED',
      'createdAt',
    );
  });
});

describe('ai generations: list', () => {
  it('answers { items, total }, newest first, and pages with limit and offset', async () => {
    const sessionId = await createSession();
    const products = await createProducts(1);
    const created: GenerationBody[] = [];
    for (let i = 0; i < 3; i += 1) created.push(await create(sessionId, products));
    const newestFirst = created.map((item) => item.id).reverse();

    const all = (await http().get(`/ai-generations?sessionId=${sessionId}`).set(admin)).body as {
      items: GenerationBody[];
      total: number;
    };
    const page = (
      await http().get(`/ai-generations?sessionId=${sessionId}&limit=2&offset=1`).set(admin)
    ).body as { items: GenerationBody[]; total: number };

    expect(all.total).toBe(3);
    expect(all.items.map((item) => item.id)).toEqual(newestFirst);
    expect(Object.keys(all.items[0] ?? {}).sort()).toEqual(RESPONSE_KEYS);
    expect(all.items[0]?.productIds).toEqual(products);
    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.id)).toEqual(newestFirst.slice(1, 3));
  });

  it('orders by createdAt desc, then id desc', async () => {
    const sessionId = await createSession();
    const same = new Date('2031-01-01T00:00:00.000Z');
    const rows = [];
    for (let i = 0; i < 3; i += 1) {
      rows.push(
        await testApp.prisma.aiGeneration.create({
          data: {
            sessionId,
            userImageKey: 'u/p.jpg',
            status: 'pending',
            aiProvider: 'p',
            aiModel: 'm',
            createdAt: same,
          },
        }),
      );
    }
    const older = await testApp.prisma.aiGeneration.create({
      data: {
        sessionId,
        userImageKey: 'u/p.jpg',
        status: 'pending',
        aiProvider: 'p',
        aiModel: 'm',
        createdAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    const expected = [...rows.map((row) => row.id).sort((a, b) => (a < b ? 1 : -1)), older.id];

    const list = (await http().get(`/ai-generations?sessionId=${sessionId}`).set(admin)).body as {
      items: GenerationBody[];
    };

    expect(list.items.map((item) => item.id)).toEqual(expected);
  });

  it('works without a filter and filters by sessionId', async () => {
    const mine = await createSession();
    const other = await createSession();
    const products = await createProducts(1);
    const own = await create(mine, products);
    await create(other, products);

    const everything = await http().get('/ai-generations').set(admin);
    const filtered = (await http().get(`/ai-generations?sessionId=${mine}`).set(admin)).body as {
      items: GenerationBody[];
      total: number;
    };

    expect(everything.status).toBe(200);
    expect((everything.body as { total: number }).total).toBeGreaterThanOrEqual(2);
    expect(filtered.total).toBe(1);
    expect(filtered.items.map((item) => item.id)).toEqual([own.id]);
  });

  it('accepts an upper-case sessionId', async () => {
    const sessionId = await createSession();
    const own = await create(sessionId, await createProducts(1));

    const response = await http()
      .get(`/ai-generations?sessionId=${sessionId.toUpperCase()}`)
      .set(admin);

    expect(response.status).toBe(200);
    expect((response.body as { items: GenerationBody[] }).items.map((item) => item.id)).toEqual([
      own.id,
    ]);
  });

  it('answers an empty list for a well-formed sessionId of no session', async () => {
    const response = await http().get(`/ai-generations?sessionId=${randomUUID()}`).set(admin);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], total: 0 });
  });

  it('refuses an empty, malformed or repeated sessionId and an unknown parameter', async () => {
    const id = randomUUID();

    expectError(
      await http().get('/ai-generations?sessionId=').set(admin),
      400,
      'VALIDATION_FAILED',
      'sessionId',
    );
    expectError(
      await http().get('/ai-generations?sessionId=not-a-uuid').set(admin),
      400,
      'VALIDATION_FAILED',
      'sessionId',
    );
    expectError(
      await http().get(`/ai-generations?sessionId=${id}&sessionId=${id}`).set(admin),
      400,
      'VALIDATION_FAILED',
      'sessionId',
    );
    expectError(
      await http().get('/ai-generations?status=pending').set(admin),
      400,
      'VALIDATION_FAILED',
      'status',
    );
  });

  it('refuses limit 101', async () => {
    expectError(
      await http().get('/ai-generations?limit=101').set(admin),
      400,
      'VALIDATION_FAILED',
      'limit',
    );
  });
});
