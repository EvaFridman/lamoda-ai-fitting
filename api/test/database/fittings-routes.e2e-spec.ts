import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { Client } from '@temporalio/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_PROVIDER, type FakeAiProvider } from '../../src/ai/ai-provider.js';
import { AI_SETTINGS, type AiSettings, aiSettings } from '../../src/ai/ai-settings.js';
import { SAFETY_CATEGORIES } from '../../src/ai/safety-category.js';
import type { Auth } from '../../src/auth/auth.js';
import { AUTH } from '../../src/auth/auth.module.js';
import type { Env } from '../../src/config/env.js';
import { endFitting } from '../../src/fittings/end-fitting.js';
import { quotaMonth } from '../../src/fittings/quota-month.js';
import type { OutfitSlot } from '../../src/generated/prisma/enums.js';
import { generationFolder, generationResultKey, userPhotoKey } from '../../src/storage/keys.js';
import { FileDeletion } from '../../src/temporal/file-deletion.js';
import { fittingWorkflowId } from '../../src/temporal/fitting-workflow-id.js';
import { WorkflowStarter } from '../../src/temporal/workflow-starter.js';
import { signIn, type SignedIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

interface Detail {
  field: string;
  code: string;
  message: string;
}
interface ErrorBody {
  error: { code: string; message: string; details: Detail[] };
}
interface ItemBody {
  productId: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  price: number;
  finalPrice: number;
  attributeValueId: string | null;
  colour: string | null;
  slot: 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessory' | null;
}
interface FittingBody {
  id: string;
  kind: 'single' | 'look';
  parentId: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage: 'queued' | 'generating' | 'done';
  failureCode: string | null;
  failureCategory: string | null;
  failureStage: string | null;
  countsAgainstLimit: boolean;
  regenerationFree: boolean;
  model: string;
  items: ItemBody[];
  promptText: string | null;
  photoId: string | null;
  resultUrl: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  estimatedSeconds: number | null;
  repeated?: boolean;
}
interface ListBody {
  items: FittingBody[];
  total: number | null;
  nextCursor: string | null;
}

interface Product {
  id: string;
  // The product's own colours (attribute value ids), in the order they were made.
  colours: string[];
  // A value of a season attribute with no coloured value: not a colour.
  nonColour: string;
  // A value of the colour attribute with colorHex null: a colour (A91).
  uncoloured: string;
  name: string;
}
interface Actor extends SignedIn {
  photoId: string;
}

const REASONS = ['face', 'item'];
const CATEGORY_REASONS = SAFETY_CATEGORIES.map((category) => `moderation:${category}`);
const ROOMY = 20;

describe('the fittings routes (spec 0019 T12: AC5-AC9, A6, A7, A20, A32, A45, A47, A69, A70)', () => {
  let testApp: TestApp;
  let fake: FakeAiProvider;
  let settings: AiSettings;
  let temporalClient: Client;
  const categories = {} as Record<'top' | 'bottom' | 'none', string>;

  beforeAll(async () => {
    testApp = await createTestApp({
      access: 'production',
      override: (builder) =>
        builder.overrideProvider(AI_SETTINGS).useFactory({
          inject: [ConfigService],
          factory: (config: ConfigService<Env, true>) => ({
            ...aiSettings(config),
            // A short check deadline, so a timed-out check does not take seconds.
            checkTimeoutMs: 100,
            monthlyLimit: 2,
          }),
        }),
    });
    fake = testApp.app.get<FakeAiProvider>(AI_PROVIDER);
    settings = testApp.app.get<AiSettings>(AI_SETTINGS);
    temporalClient = testApp.app.get(Client);
    const prisma = testApp.prisma;
    const slots: [keyof typeof categories, OutfitSlot | null][] = [
      ['top', 'top'],
      ['bottom', 'bottom'],
      ['none', null],
    ];
    for (const [name, slot] of slots) {
      const category = await prisma.category.create({
        data: {
          name: `Fittings ${name} ${randomUUID()}`,
          slug: `f-${randomUUID()}`,
          isActive: true,
          slot,
        },
      });
      categories[name] = category.id;
    }
  }, 120_000);

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    settings.monthlyLimit = ROOMY;
    fake.delayMs = 0;
  });

  const prisma = () => testApp.prisma;
  const http = () => request(testApp.app.getHttpServer());

  // A product of the category with `colours` values of its own and a catalog image.
  async function product(category: keyof typeof categories = 'top', colours = 1): Promise<Product> {
    const brand = await prisma().brand.create({ data: { name: `Brand ${randomUUID()}` } });
    const created = await prisma().product.create({
      data: {
        article: `F-${randomUUID()}`,
        name: `Платье ${randomUUID().slice(0, 8)}`,
        price: 1000,
        discount: 20,
        brandId: brand.id,
        categoryId: categories[category],
      },
    });
    await prisma().productImage.create({
      data: { productId: created.id, imageKey: `test/${randomUUID()}.webp` },
    });
    const attribute = await prisma().attribute.create({ data: { name: `Colour ${randomUUID()}` } });
    const ids: string[] = [];
    for (let index = 0; index < colours; index++) {
      const value = await prisma().attributeValue.create({
        data: { attributeId: attribute.id, value: `Цвет ${index}`, colorHex: '#FF0000' },
      });
      await prisma().productAttributeValue.create({
        data: { productId: created.id, attributeValueId: value.id },
      });
      ids.push(value.id);
    }
    // A colour with no swatch («в полоску») is a colour of the colour attribute too (A91).
    const striped = await prisma().attributeValue.create({
      data: { attributeId: attribute.id, value: 'в полоску' },
    });
    await prisma().productAttributeValue.create({
      data: { productId: created.id, attributeValueId: striped.id },
    });
    // A value of another attribute with no coloured value, a season, is not a colour.
    const seasonAttribute = await prisma().attribute.create({
      data: { name: `Season ${randomUUID()}` },
    });
    const season = await prisma().attributeValue.create({
      data: { attributeId: seasonAttribute.id, value: 'демисезон' },
    });
    await prisma().productAttributeValue.create({
      data: { productId: created.id, attributeValueId: season.id },
    });
    return {
      id: created.id,
      colours: ids,
      name: created.name,
      nonColour: season.id,
      uncoloured: striped.id,
    };
  }

  // A signed-in user with a saved photo (no file: the routes never read it).
  async function actor(options: { transient?: boolean } = {}): Promise<Actor> {
    const who = await signIn(testApp.app);
    const photo = await photoOf(who.userId, options.transient ?? false);
    return { ...who, photoId: photo };
  }

  async function photoOf(userId: string, transient: boolean): Promise<string> {
    const photo = await prisma().userPhoto.create({
      data: {
        userId,
        imageKey: userPhotoKey(userId),
        transient,
        isDefault: false,
        width: 64,
        height: 96,
      },
    });
    return photo.id;
  }

  const single = (who: Actor, item: Product, extra: Record<string, unknown> = {}) => ({
    photoId: who.photoId,
    kind: 'single',
    items: [{ productId: item.id }],
    ...extra,
  });

  const look = (who: Actor, items: Product[], extra: Record<string, unknown> = {}) => ({
    photoId: who.photoId,
    kind: 'look',
    items: items.map((item) => ({ productId: item.id })),
    ...extra,
  });

  const start = (who: SignedIn | null, body: unknown) => {
    const req = http().post('/fittings');
    if (who !== null) req.set({ Cookie: who.cookie });
    return req.send(body as object);
  };
  const regenerate = (who: SignedIn, id: string, body: unknown) =>
    http()
      .post(`/fittings/${id}/regenerate`)
      .set({ Cookie: who.cookie })
      .send(body as object);
  const get = (who: SignedIn, id: string) =>
    http().get(`/fittings/${id}`).set({ Cookie: who.cookie });
  const list = (who: SignedIn, query = '') =>
    http().get(`/fittings${query}`).set({ Cookie: who.cookie });
  const remove = (who: SignedIn, id: string) =>
    http().delete(`/fittings/${id}`).set({ Cookie: who.cookie });
  const quota = (who: SignedIn) => http().get('/me/fitting-quota').set({ Cookie: who.cookie });

  const bodyOf = (response: request.Response) => response.body as FittingBody;
  const errorOf = (response: request.Response) => (response.body as ErrorBody).error;

  async function started(who: Actor, body: unknown, status = 201): Promise<FittingBody> {
    const response = await start(who, body);
    expect(response.status, JSON.stringify(response.body)).toBe(status);
    return bodyOf(response);
  }

  // The worker is not running in this file, so a started fitting waits as `pending`: the tests end
  // it by hand, as the workflow's `complete` would.
  async function finish(id: string): Promise<void> {
    const row = await prisma().aiGeneration.findUniqueOrThrow({ where: { id } });
    await prisma().aiGeneration.update({
      where: { id },
      data: {
        status: 'completed',
        startedAt: new Date(),
        finishedAt: new Date(),
        resultImageKey: generationResultKey(row.userId ?? '', id),
      },
    });
  }

  const row = (id: string) => prisma().aiGeneration.findUniqueOrThrow({ where: { id } });
  const rowsOf = (userId: string) => prisma().aiGeneration.findMany({ where: { userId } });

  async function usedOf(userId: string): Promise<number> {
    const found = await prisma().fittingQuota.findUnique({
      where: { userId_month: { userId, month: quotaMonth(new Date()) } },
    });
    return found?.used ?? 0;
  }

  async function setUsed(userId: string, used: number): Promise<void> {
    const month = quotaMonth(new Date());
    await prisma().fittingQuota.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, used },
      update: { used },
    });
  }

  function expectError(
    response: request.Response,
    status: number,
    code: string,
    detail?: { field: string; code: string },
  ): void {
    expect(response.status, JSON.stringify(response.body)).toBe(status);
    expect(errorOf(response).code).toBe(code);
    if (detail !== undefined) {
      expect(errorOf(response).details).toContainEqual(expect.objectContaining(detail));
    }
  }

  async function cancelRequested(id: string): Promise<boolean> {
    const history = await temporalClient.workflow.getHandle(fittingWorkflowId(id)).fetchHistory();
    return (history.events ?? []).some((event) =>
      Boolean(event.workflowExecutionCancelRequestedEventAttributes),
    );
  }

  describe('POST /fittings', () => {
    it('starts a pending fitting, spends one try-on and starts its workflow (AC5)', async () => {
      settings.monthlyLimit = 2;
      const who = await actor();
      const dress = await product('top', 2);

      const response = await start(who, single(who, dress, { promptText: 'long sleeves' }));

      expect(response.status).toBe(201);
      const body = bodyOf(response);
      expect(body).toMatchObject({
        kind: 'single',
        parentId: null,
        status: 'pending',
        stage: 'queued',
        failureCode: null,
        countsAgainstLimit: true,
        regenerationFree: false,
        photoId: who.photoId,
        resultUrl: null,
        startedAt: null,
        finishedAt: null,
        estimatedSeconds: 25,
        repeated: false,
      });
      expect(body.model).toBe(fake.model);
      expect(body.items).toEqual([
        {
          productId: dress.id,
          name: dress.name,
          brand: expect.any(String),
          imageUrl: expect.stringContaining('/media/test/'),
          price: 1000,
          finalPrice: 800,
          attributeValueId: null,
          colour: null,
          slot: 'top',
        },
      ]);
      expect(body.promptText).toBe('long sleeves');
      const stored = await row(body.id);
      expect(stored).toMatchObject({
        userId: who.userId,
        kind: 'single',
        photoId: who.photoId,
        promptText: 'long sleeves',
        comment: null,
        status: 'pending',
        countsAgainstLimit: true,
        freeRegenerationUsed: false,
        aiProvider: 'fake',
      });
      expect(stored.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(await usedOf(who.userId)).toBe(1);
      const workflow = await temporalClient.workflow
        .getHandle(fittingWorkflowId(body.id))
        .describe();
      expect(workflow.status.name).toBe('RUNNING');
    });

    it('shows the spend and the renewal in GET /me/fitting-quota (AC6)', async () => {
      settings.monthlyLimit = 2;
      const who = await actor();
      const before = await quota(who);
      await started(who, single(who, await product()));

      const after = await quota(who);

      const moscow = new Date(Date.now() + 3 * 3_600_000);
      const renews = new Date(
        Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth() + 1, 1) - 3 * 3_600_000,
      ).toISOString();
      expect(before.status).toBe(200);
      expect(before.body).toEqual({ limit: 2, used: 0, left: 2, renewsAt: renews });
      expect(after.body).toEqual({ limit: 2, used: 1, left: 1, renewsAt: renews });
    });

    it('keeps the quota of one user apart from another’s', async () => {
      settings.monthlyLimit = 2;
      const one = await actor();
      const two = await actor();
      await started(one, single(one, await product()));

      expect((await quota(two)).body).toMatchObject({ used: 0, left: 2 });
    });

    it('starts a look of two items of different slots', async () => {
      const who = await actor();
      const shirt = await product('top');
      const jeans = await product('bottom');

      const body = await started(who, look(who, [shirt, jeans]));

      expect(body.kind).toBe('look');
      expect(body.items.map((item) => item.productId).sort()).toEqual([shirt.id, jeans.id].sort());
      const links = await prisma().generationProduct.findMany({ where: { generationId: body.id } });
      expect(links.map((link) => link.slot).sort()).toEqual(['bottom', 'top']);
    });

    it('stores the colour of an item and answers its name', async () => {
      const who = await actor();
      const dress = await product('top', 2);

      const body = await started(
        who,
        single(who, dress, {
          items: [{ productId: dress.id, attributeValueId: dress.colours[1] }],
        }),
      );

      expect(body.items[0]).toMatchObject({
        attributeValueId: dress.colours[1],
        colour: 'Цвет 1',
      });
    });

    it('accepts ids in upper case as the same ids', async () => {
      const who = await actor();
      const dress = await product();
      const first = await started(who, single(who, dress));
      await finish(first.id);

      const again = await start(who, {
        photoId: who.photoId.toUpperCase(),
        kind: 'single',
        items: [{ productId: dress.id.toUpperCase() }],
      });

      expect(again.status).toBe(200);
      expect(bodyOf(again)).toMatchObject({ id: first.id, repeated: true });
    });

    it('answers 401 to an anonymous visitor and starts nothing', async () => {
      const who = await actor();

      const response = await start(null, single(who, await product()));

      expectError(response, 401, 'UNAUTHORIZED');
      expect(await rowsOf(who.userId)).toEqual([]);
    });

    it('answers 401 for a gone user before the text check, and stores nothing (A45)', async () => {
      const who = await actor();
      const dress = await product();
      const { authCookies } = await testApp.app.get<Auth>(AUTH).$context;
      const session = await http().get('/api/auth/get-session').set({ Cookie: who.cookie });
      const data = (session.headers['set-cookie'] as string[] | undefined)
        ?.find((line) => line.startsWith(`${authCookies.sessionData.name}=`))
        ?.split(';')[0];
      expect(data, 'the cached session copy').toBeTruthy();
      await prisma().user.delete({ where: { id: who.userId } });
      const check = vi.spyOn(fake, 'checkPrompt');

      const response = await http()
        .post('/fittings')
        .set({ Cookie: `${who.cookie}; ${data}` })
        .send(single(who, dress, { promptText: 'something' }));

      const called = check.mock.calls.length;
      check.mockRestore();
      expectError(response, 401, 'UNAUTHORIZED');
      expect(called).toBe(0);
      expect(await rowsOf(who.userId)).toEqual([]);
    });
  });

  describe('the monthly limit (A20, A25)', () => {
    beforeEach(() => {
      settings.monthlyLimit = 2;
    });

    it('refuses the third start with 409 LIMIT_REACHED and inserts no row (AC6)', async () => {
      const who = await actor();
      await started(who, single(who, await product()));
      await started(who, single(who, await product()));

      const response = await start(who, single(who, await product()));

      expectError(response, 409, 'LIMIT_REACHED');
      expect(errorOf(response).message).toContain('renews at');
      expect(await rowsOf(who.userId)).toHaveLength(2);
      expect(await usedOf(who.userId)).toBe(2);
      expect((await quota(who)).body).toMatchObject({ used: 2, left: 0 });
    });

    it('lets exactly one of several parallel starts pass at the edge', async () => {
      const who = await actor();
      await setUsed(who.userId, 1);
      const products = await Promise.all([product(), product(), product(), product()]);

      const responses = await Promise.all(products.map((item) => start(who, single(who, item))));

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409]);
      expect(await rowsOf(who.userId)).toHaveLength(1);
      expect(await usedOf(who.userId)).toBe(2);
    });

    it('keeps the try-on spent after its result is deleted', async () => {
      const who = await actor();
      const first = await started(who, single(who, await product()));
      await finish(first.id);
      await started(who, single(who, await product()));

      await remove(who, first.id).expect(204);
      const response = await start(who, single(who, await product()));

      expect(await usedOf(who.userId)).toBe(2);
      expectError(response, 409, 'LIMIT_REACHED');
    });

    it('does not count a refused start (validation, text) against the limit', async () => {
      const who = await actor();
      const dress = await product();

      await start(who, single(who, dress, { promptText: 'refuse:moderation' })).expect(400);
      await start(who, single(who, dress, { items: [] })).expect(400);

      expect(await usedOf(who.userId)).toBe(0);
    });

    it('does not spend a try-on on a repeat or a running duplicate (A7, A32)', async () => {
      const who = await actor();
      const dress = await product();
      const first = await started(who, single(who, dress));
      await started(who, single(who, dress), 200);
      await finish(first.id);
      await started(who, single(who, dress), 200);

      expect(await usedOf(who.userId)).toBe(1);
      expect(await rowsOf(who.userId)).toHaveLength(1);
    });
  });

  describe('a repeat of a completed fitting (A7)', () => {
    it('opens the same result for free, with repeated true', async () => {
      const who = await actor();
      const dress = await product();
      const first = await started(who, single(who, dress, { promptText: 'long sleeves' }));
      await finish(first.id);

      const response = await start(who, single(who, dress, { promptText: 'long sleeves' }));

      expect(response.status).toBe(200);
      expect(bodyOf(response)).toMatchObject({
        id: first.id,
        status: 'completed',
        stage: 'done',
        repeated: true,
        estimatedSeconds: null,
        regenerationFree: true,
      });
      expect(bodyOf(response).resultUrl).toContain(generationResultKey(who.userId, first.id));
      expect(await usedOf(who.userId)).toBe(1);
      expect(await rowsOf(who.userId)).toHaveLength(1);
    });

    it('takes the items of a look in any order as the same try-on', async () => {
      const who = await actor();
      const shirt = await product('top');
      const jeans = await product('bottom');
      const first = await started(who, look(who, [shirt, jeans]));
      await finish(first.id);

      const response = await start(who, look(who, [jeans, shirt]));

      expect(response.status).toBe(200);
      expect(bodyOf(response)).toMatchObject({ id: first.id, repeated: true });
    });

    it('takes blank wishes and wishes with spaces around them as the same text', async () => {
      const who = await actor();
      const dress = await product();
      const plain = await started(who, single(who, dress));
      await finish(plain.id);
      const worded = await started(who, single(who, dress, { promptText: 'bright' }));
      await finish(worded.id);

      const blank = await start(who, single(who, dress, { promptText: '   ' }));
      const spaced = await start(who, single(who, dress, { promptText: '  bright  ' }));

      expect(blank.status).toBe(200);
      expect(bodyOf(blank).id).toBe(plain.id);
      expect(spaced.status).toBe(200);
      expect(bodyOf(spaced).id).toBe(worded.id);
      expect(await rowsOf(who.userId)).toHaveLength(2);
      expect((await row(worded.id)).promptText).toBe('bright');
    });

    it('makes a new try-on for another colour, another text or another photo', async () => {
      const who = await actor();
      const dress = await product('top', 2);
      const base = await started(
        who,
        single(who, dress, {
          items: [{ productId: dress.id, attributeValueId: dress.colours[0] }],
        }),
      );
      await finish(base.id);

      const otherColour = await started(
        who,
        single(who, dress, {
          items: [{ productId: dress.id, attributeValueId: dress.colours[1] }],
        }),
      );
      const otherText = await started(
        who,
        single(who, dress, {
          items: [{ productId: dress.id, attributeValueId: dress.colours[0] }],
          promptText: 'bright',
        }),
      );
      const otherPhoto = await started(
        who,
        single(who, dress, {
          items: [{ productId: dress.id, attributeValueId: dress.colours[0] }],
          photoId: await photoOf(who.userId, false),
        }),
      );

      const ids = new Set([base.id, otherColour.id, otherText.id, otherPhoto.id]);
      expect(ids.size).toBe(4);
      expect(await usedOf(who.userId)).toBe(4);
    });

    it('does not repeat a failed fitting: it starts a new one', async () => {
      const who = await actor();
      const dress = await product();
      const first = await started(who, single(who, dress));
      await endFitting(prisma(), first.id, {
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'x',
        providerRequestId: null,
      });

      const again = await started(who, single(who, dress));

      expect(again.id).not.toBe(first.id);
      expect(again.repeated).toBe(false);
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('makes a new generation once the completed result was deleted', async () => {
      const who = await actor();
      const dress = await product();
      const first = await started(who, single(who, dress));
      await finish(first.id);
      await remove(who, first.id).expect(204);

      const again = await started(who, single(who, dress));

      expect(again.id).not.toBe(first.id);
      expect(again.repeated).toBe(false);
      expect(await usedOf(who.userId)).toBe(2);
    });

    it('does not open the result of another user', async () => {
      const dress = await product();
      const one = await actor();
      const two = await actor();
      const first = await started(one, single(one, dress));
      await finish(first.id);

      const mine = await started(two, single(two, dress));

      expect(mine.id).not.toBe(first.id);
    });

    it('does not run the paid text check for a repeat (A16)', async () => {
      const who = await actor();
      const dress = await product();
      const first = await started(who, single(who, dress, { promptText: 'bright' }));
      await finish(first.id);
      const check = vi.spyOn(fake, 'checkPrompt');

      const response = await start(who, single(who, dress, { promptText: 'bright' }));

      const called = check.mock.calls.length;
      check.mockRestore();
      expect(response.status).toBe(200);
      expect(called).toBe(0);
    });
  });

  describe('a running duplicate (A32)', () => {
    it('answers the running fitting of an identical request with 200 and counts one try-on', async () => {
      const who = await actor();
      const dress = await product();
      const first = await started(who, single(who, dress, { promptText: 'bright' }));
      const check = vi.spyOn(fake, 'checkPrompt');

      const second = await start(who, single(who, dress, { promptText: 'bright' }));

      const called = check.mock.calls.length;
      check.mockRestore();
      expect(second.status).toBe(200);
      expect(bodyOf(second)).toMatchObject({
        id: first.id,
        status: 'pending',
        repeated: false,
        estimatedSeconds: 25,
      });
      expect(called).toBe(0);
      expect(await rowsOf(who.userId)).toHaveLength(1);
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('makes one row and one unit of two parallel identical requests', async () => {
      const who = await actor();
      const dress = await product();
      const body = single(who, dress);

      const responses = await Promise.all([start(who, body), start(who, body)]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
      expect(bodyOf(responses[0]!).id).toBe(bodyOf(responses[1]!).id);
      expect(await rowsOf(who.userId)).toHaveLength(1);
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('makes one row and one unit of many parallel identical requests', async () => {
      const who = await actor();
      const body = single(who, await product(), { promptText: 'bright' });

      const responses = await Promise.all(Array.from({ length: 5 }, () => start(who, body)));

      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 200)).toHaveLength(4);
      expect(new Set(responses.map((response) => bodyOf(response).id)).size).toBe(1);
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('lets another user start the same request', async () => {
      const dress = await product();
      const one = await actor();
      const two = await actor();
      await started(one, single(one, dress));

      const mine = await started(two, single(two, dress));

      expect(mine.repeated).toBe(false);
    });
  });

  describe('the text check (A16, A45)', () => {
    it('refuses a refused text with 400 PROMPT_REFUSED, stores nothing and spends nothing', async () => {
      const who = await actor();

      const response = await start(
        who,
        single(who, await product(), { promptText: 'refuse:moderation' }),
      );

      expectError(response, 400, 'PROMPT_REFUSED');
      expect(errorOf(response).message).toContain('moderation');
      expect(errorOf(response).message).not.toContain('refuse:');
      expect(await rowsOf(who.userId)).toEqual([]);
      expect(await usedOf(who.userId)).toBe(0);
    });

    it.each([
      'other_people',
      'nudity',
      'minors',
      'violence',
      'politics',
      'unrelated',
      ...CATEGORY_REASONS,
    ])('names the reason %s in the one detail of PROMPT_REFUSED', async (reason) => {
      const who = await actor();

      const response = await start(
        who,
        single(who, await product(), { promptText: `a wish refuse:${reason}` }),
      );

      expectError(response, 400, 'PROMPT_REFUSED');
      expect(errorOf(response).details).toEqual([
        {
          field: 'promptText',
          code: 'PROMPT_REFUSED',
          message: `promptText was refused: ${reason}`,
        },
      ]);
      expect(await rowsOf(who.userId)).toEqual([]);
      expect(await usedOf(who.userId)).toBe(0);
    });

    it('names a bare moderation refusal moderation:unknown', async () => {
      const who = await actor();

      const response = await start(
        who,
        single(who, await product(), { promptText: 'refuse:moderation' }),
      );

      expect(errorOf(response).details).toEqual([
        {
          field: 'promptText',
          code: 'PROMPT_REFUSED',
          message: 'promptText was refused: moderation:unknown',
        },
      ]);
    });

    it('answers 503 SERVICE_UNAVAILABLE for an unreadable verdict, spending and storing nothing (Y19)', async () => {
      const who = await actor();

      const response = await start(
        who,
        single(who, await product(), { promptText: 'fail:unreadable_verdict' }),
      );

      expectError(response, 503, 'SERVICE_UNAVAILABLE');
      expect(await rowsOf(who.userId)).toEqual([]);
      expect(await usedOf(who.userId)).toBe(0);
    });

    it('answers 503 SERVICE_UNAVAILABLE when the check does not answer in time, storing nothing', async () => {
      const who = await actor();
      fake.delayMs = 2000;

      const response = await start(who, single(who, await product(), { promptText: 'bright' }));

      fake.delayMs = 0;
      expectError(response, 503, 'SERVICE_UNAVAILABLE');
      expect(await rowsOf(who.userId)).toEqual([]);
      expect(await usedOf(who.userId)).toBe(0);
    });

    it('does not check a start without wishes, whatever the check does', async () => {
      const who = await actor();
      fake.delayMs = 2000;

      const response = await start(who, single(who, await product()));

      fake.delayMs = 0;
      expect(response.status).toBe(201);
    });

    it('checks the wishes with the names of the products and their categories (Y16)', async () => {
      const who = await actor();
      const shirt = await product('top');
      const jeans = await product('bottom');
      const names = await prisma().category.findMany({
        where: { id: { in: [categories.top, categories.bottom] } },
      });
      const nameOf = (id: string) => names.find((category) => category.id === id)?.name;
      const check = vi.spyOn(fake, 'checkPrompt');

      await started(who, look(who, [shirt, jeans], { promptText: 'tucked in' }));

      const calls = [...check.mock.calls];
      check.mockRestore();
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('tucked in');
      const items = calls[0]?.[1].items ?? [];
      expect([...items].sort((a, b) => a.name.localeCompare(b.name))).toEqual(
        [
          { name: shirt.name, category: nameOf(categories.top) },
          { name: jeans.name, category: nameOf(categories.bottom) },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
    });

    it('works again once the check answers', async () => {
      const who = await actor();

      await started(who, single(who, await product(), { promptText: 'bright' }));
    });
  });

  describe('validation', () => {
    async function expectRefused(
      who: Actor,
      body: unknown,
      status: number,
      code: string,
      detail: { field: string; code: string },
    ): Promise<void> {
      expectError(await start(who, body), status, code, detail);
      expect(await rowsOf(who.userId)).toEqual([]);
      expect(await usedOf(who.userId)).toBe(0);
    }

    it('refuses a single with two items: ARRAY_MAX_SIZE', async () => {
      const who = await actor();
      const items = [
        { productId: (await product('top')).id },
        { productId: (await product('bottom')).id },
      ];

      await expectRefused(who, single(who, await product(), { items }), 400, 'VALIDATION_FAILED', {
        field: 'items',
        code: 'ARRAY_MAX_SIZE',
      });
    });

    it('refuses a look with one item: ARRAY_MIN_SIZE', async () => {
      const who = await actor();

      await expectRefused(who, look(who, [await product()]), 400, 'VALIDATION_FAILED', {
        field: 'items',
        code: 'ARRAY_MIN_SIZE',
      });
    });

    it('refuses no items at all', async () => {
      const who = await actor();

      await expectRefused(
        who,
        single(who, await product(), { items: [] }),
        400,
        'VALIDATION_FAILED',
        {
          field: 'items',
          code: 'ARRAY_MIN_SIZE',
        },
      );
    });

    it('refuses more than five items in a look', async () => {
      const who = await actor();
      const items = Array.from({ length: 6 }, () => ({ productId: randomUUID() }));

      await expectRefused(who, look(who, [], { items }), 400, 'VALIDATION_FAILED', {
        field: 'items',
        code: 'ARRAY_MAX_SIZE',
      });
    });

    it('refuses the same product twice: ARRAY_UNIQUE', async () => {
      const who = await actor();
      const dress = await product();

      await expectRefused(who, look(who, [dress, dress]), 400, 'VALIDATION_FAILED', {
        field: 'items',
        code: 'ARRAY_UNIQUE',
      });
    });

    it('refuses a product of a category with no slot: HAS_SLOT on its item', async () => {
      const who = await actor();
      const thing = await product('none');

      await expectRefused(who, single(who, thing), 400, 'VALIDATION_FAILED', {
        field: 'items.0.productId',
        code: 'HAS_SLOT',
      });
    });

    it('refuses a look of two items of one slot: DISTINCT_SLOTS on the second', async () => {
      const who = await actor();

      await expectRefused(
        who,
        look(who, [await product('top'), await product('top')]),
        400,
        'VALIDATION_FAILED',
        { field: 'items.1.productId', code: 'DISTINCT_SLOTS' },
      );
    });

    it('lets a single take the slot twice over two fittings (the rule is a look’s)', async () => {
      const who = await actor();

      await started(who, single(who, await product('top')));
      await started(who, single(who, await product('top')));
    });

    it('refuses a colour that is not the product’s: RELATED_NOT_FOUND on the item', async () => {
      const who = await actor();
      const dress = await product('top');
      const other = await product('top');

      await expectRefused(
        who,
        single(who, dress, {
          items: [{ productId: dress.id, attributeValueId: other.colours[0] }],
        }),
        400,
        'RELATED_NOT_FOUND',
        { field: 'items.0.attributeValueId', code: 'RELATED_NOT_FOUND' },
      );
    });

    it('refuses a value of the product that is not a colour (A76): message, nothing written', async () => {
      const who = await actor();
      const dress = await product('top');

      const response = await start(
        who,
        single(who, dress, { items: [{ productId: dress.id, attributeValueId: dress.nonColour }] }),
      );

      expectError(response, 400, 'RELATED_NOT_FOUND', {
        field: 'items.0.attributeValueId',
        code: 'RELATED_NOT_FOUND',
      });
      expect(errorOf(response).details).toContainEqual(
        expect.objectContaining({
          message: 'items.0.attributeValueId is not a colour of its product',
        }),
      );
      expect(await rowsOf(who.userId)).toEqual([]);
      expect(await usedOf(who.userId)).toBe(0);
    });

    it('names the item with a non-colour value in a look', async () => {
      const who = await actor();
      const shirt = await product('top');
      const jeans = await product('bottom');

      await expectRefused(
        who,
        look(who, [shirt, jeans], {
          items: [
            { productId: shirt.id },
            { productId: jeans.id, attributeValueId: jeans.nonColour },
          ],
        }),
        400,
        'RELATED_NOT_FOUND',
        { field: 'items.1.attributeValueId', code: 'RELATED_NOT_FOUND' },
      );
    });

    it('still accepts a colour value of the product', async () => {
      const who = await actor();
      const dress = await product('top');

      const body = await started(
        who,
        single(who, dress, {
          items: [{ productId: dress.id, attributeValueId: dress.colours[0] }],
        }),
      );

      expect(body.items[0]).toMatchObject({ attributeValueId: dress.colours[0] });
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('accepts a value of the colour attribute with no swatch as a colour (A91)', async () => {
      const who = await actor();
      const dress = await product('top');

      const body = await started(
        who,
        single(who, dress, {
          items: [{ productId: dress.id, attributeValueId: dress.uncoloured }],
        }),
      );

      expect(body.items[0]).toMatchObject({
        attributeValueId: dress.uncoloured,
        colour: 'в полоску',
      });
    });

    it('names the item that is wrong in a look', async () => {
      const who = await actor();
      const shirt = await product('top');
      const jeans = await product('bottom');

      await expectRefused(
        who,
        look(who, [shirt, jeans], {
          items: [
            { productId: shirt.id },
            { productId: jeans.id, attributeValueId: shirt.colours[0] },
          ],
        }),
        400,
        'RELATED_NOT_FOUND',
        { field: 'items.1.attributeValueId', code: 'RELATED_NOT_FOUND' },
      );
    });

    it('refuses an unknown product: RELATED_NOT_FOUND on the item', async () => {
      const who = await actor();

      await expectRefused(
        who,
        single(who, await product(), { items: [{ productId: randomUUID() }] }),
        400,
        'RELATED_NOT_FOUND',
        { field: 'items.0.productId', code: 'RELATED_NOT_FOUND' },
      );
    });

    it('refuses another user’s photo: RELATED_NOT_FOUND on photoId', async () => {
      const who = await actor();
      const other = await actor();

      await expectRefused(
        who,
        single(who, await product(), { photoId: other.photoId }),
        400,
        'RELATED_NOT_FOUND',
        { field: 'photoId', code: 'RELATED_NOT_FOUND' },
      );
    });

    it('refuses an unknown photo', async () => {
      const who = await actor();

      await expectRefused(
        who,
        single(who, await product(), { photoId: randomUUID() }),
        400,
        'RELATED_NOT_FOUND',
        { field: 'photoId', code: 'RELATED_NOT_FOUND' },
      );
    });

    it('takes a one-time photo too (A24)', async () => {
      const who = await actor({ transient: true });

      const body = await started(who, single(who, await product()));

      expect(body.photoId).toBe(who.photoId);
    });

    it('refuses wishes over 200 characters: MAX_LENGTH, and takes 200', async () => {
      const who = await actor();
      const dress = await product();

      await expectRefused(
        who,
        single(who, dress, { promptText: 'a'.repeat(201) }),
        400,
        'VALIDATION_FAILED',
        { field: 'promptText', code: 'MAX_LENGTH' },
      );
      await started(who, single(who, dress, { promptText: 'a'.repeat(200) }));
    });

    it.each([
      ['a kind that is not one', { kind: 'outfit' }, 'kind', 'IS_ENUM'],
      ['no kind', { kind: undefined }, 'kind', 'IS_ENUM'],
      ['a photoId that is not a uuid', { photoId: 'x' }, 'photoId', 'IS_UUID'],
      ['a field it does not know', { userId: randomUUID() }, 'userId', 'WHITELIST_VALIDATION'],
    ])('refuses %s', async (_name, change, field, code) => {
      const who = await actor();

      await expectRefused(who, single(who, await product(), change), 400, 'VALIDATION_FAILED', {
        field,
        code,
      });
    });
  });

  describe('POST /fittings/:id/regenerate (A6, A16, A70)', () => {
    // A completed fitting with wishes, ready to regenerate.
    async function completed(who: Actor, promptText = 'long sleeves') {
      const dress = await product();
      const parent = await started(who, single(who, dress, { promptText }));
      await finish(parent.id);
      return { parent, dress };
    }

    it('makes the first regeneration free: parent set, no unit, the parent’s flag used', async () => {
      const who = await actor();
      const { parent, dress } = await completed(who);
      expect(bodyOf(await get(who, parent.id)).regenerationFree).toBe(true);

      const response = await regenerate(who, parent.id, {
        reasons: REASONS,
        comment: '  brighter  ',
      });

      expect(response.status).toBe(201);
      expect(bodyOf(response)).toMatchObject({
        parentId: parent.id,
        kind: 'single',
        status: 'pending',
        stage: 'queued',
        countsAgainstLimit: false,
        regenerationFree: false,
        repeated: false,
        photoId: who.photoId,
      });
      expect(bodyOf(response).items.map((item) => item.productId)).toEqual([dress.id]);
      expect(await usedOf(who.userId)).toBe(1);
      expect(bodyOf(await get(who, parent.id)).regenerationFree).toBe(false);
      const stored = await row(bodyOf(response).id);
      const parentRow = await row(parent.id);
      expect(stored).toMatchObject({
        parentId: parent.id,
        promptText: 'long sleeves',
        comment: 'brighter',
        regenerationReasons: REASONS,
        countsAgainstLimit: false,
        photoId: who.photoId,
        sessionId: parentRow.sessionId,
        aiProvider: 'fake',
      });
      expect(stored.fingerprint).toBe(parentRow.fingerprint);
      expect(parentRow.freeRegenerationUsed).toBe(true);
      const workflow = await temporalClient.workflow
        .getHandle(fittingWorkflowId(stored.id))
        .describe();
      expect(workflow.status.name).toBe('RUNNING');
    });

    it('copies the items with their colours and slots', async () => {
      const who = await actor();
      const shirt = await product('top', 2);
      const jeans = await product('bottom');
      const parent = await started(
        who,
        look(who, [shirt, jeans], {
          items: [
            { productId: shirt.id, attributeValueId: shirt.colours[1] },
            { productId: jeans.id },
          ],
        }),
      );
      await finish(parent.id);

      const child = bodyOf(await regenerate(who, parent.id, { reasons: ['item'] }).expect(201));

      expect(child.kind).toBe('look');
      const links = await prisma().generationProduct.findMany({
        where: { generationId: child.id },
        orderBy: { slot: 'desc' },
      });
      expect(links).toEqual([
        { generationId: child.id, productId: jeans.id, attributeValueId: null, slot: 'bottom' },
        {
          generationId: child.id,
          productId: shirt.id,
          attributeValueId: shirt.colours[1],
          slot: 'top',
        },
      ]);
    });

    it('makes a look’s regeneration with the reason item and a comment free: the quota is unchanged', async () => {
      const who = await actor();
      const shirt = await product('top');
      const jeans = await product('bottom');
      const parent = await started(who, look(who, [shirt, jeans]));
      await finish(parent.id);
      const before = await quota(who).expect(200);

      const child = bodyOf(
        await regenerate(who, parent.id, { reasons: ['item'], comment: 'a longer skirt' }).expect(
          201,
        ),
      );

      expect(child).toMatchObject({ kind: 'look', parentId: parent.id, countsAgainstLimit: false });
      expect(await usedOf(who.userId)).toBe(1);
      const after = await quota(who).expect(200);
      expect((after.body as { left: number }).left).toBe((before.body as { left: number }).left);
      expect((await row(child.id)).comment).toBe('a longer skirt');
      expect((await row(parent.id)).freeRegenerationUsed).toBe(true);
    });

    it('takes a regeneration with no comment', async () => {
      const who = await actor();
      const { parent } = await completed(who);

      const response = await regenerate(who, parent.id, { reasons: ['face'] });

      expect(response.status).toBe(201);
      expect((await row(bodyOf(response).id)).comment).toBeNull();
    });

    it('spends a try-on on the second regeneration of the same result', async () => {
      const who = await actor();
      const { parent } = await completed(who);
      const first = bodyOf(await regenerate(who, parent.id, { reasons: REASONS }).expect(201));
      await finish(first.id);

      const second = await regenerate(who, parent.id, { reasons: REASONS });

      expect(second.status).toBe(201);
      expect(bodyOf(second)).toMatchObject({ countsAgainstLimit: true, parentId: parent.id });
      expect(await usedOf(who.userId)).toBe(2);
    });

    it('gives a failed free regeneration back: the parent’s next one is free again', async () => {
      const who = await actor();
      const { parent } = await completed(who);
      const first = bodyOf(await regenerate(who, parent.id, { reasons: REASONS }).expect(201));
      await endFitting(prisma(), first.id, {
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'x',
        providerRequestId: null,
      });
      expect(bodyOf(await get(who, parent.id)).regenerationFree).toBe(true);

      const again = await regenerate(who, parent.id, { reasons: REASONS });

      expect(again.status).toBe(201);
      expect(bodyOf(again).countsAgainstLimit).toBe(false);
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('does not give the free one back for a cancelled regeneration (A47)', async () => {
      const who = await actor();
      const { parent } = await completed(who);
      const first = bodyOf(await regenerate(who, parent.id, { reasons: REASONS }).expect(201));
      await endFitting(prisma(), first.id, {
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'cancelled',
        providerRequestId: null,
        keepUnit: true,
      });

      expect(bodyOf(await get(who, parent.id)).regenerationFree).toBe(false);
    });

    it('does not give the free one back when the free regeneration is deleted', async () => {
      const who = await actor();
      const { parent } = await completed(who);
      const first = bodyOf(await regenerate(who, parent.id, { reasons: REASONS }).expect(201));
      await finish(first.id);
      await remove(who, first.id).expect(204);

      expect(bodyOf(await get(who, parent.id)).regenerationFree).toBe(false);
      const second = await regenerate(who, parent.id, { reasons: REASONS });
      expect(bodyOf(second).countsAgainstLimit).toBe(true);
    });

    it('lets the free regeneration through with the limit spent, and refuses the paid one', async () => {
      settings.monthlyLimit = 2;
      const who = await actor();
      const { parent } = await completed(who);
      await setUsed(who.userId, 2);

      const free = bodyOf(await regenerate(who, parent.id, { reasons: REASONS }).expect(201));
      await finish(free.id);
      const paid = await regenerate(who, parent.id, { reasons: REASONS });

      expectError(paid, 409, 'LIMIT_REACHED');
      expect(await usedOf(who.userId)).toBe(2);
      expect(await prisma().aiGeneration.count({ where: { parentId: parent.id } })).toBe(1);
    });

    it('answers the running regeneration to a second request, spending nothing (A32)', async () => {
      const who = await actor();
      const { parent } = await completed(who);
      const first = bodyOf(await regenerate(who, parent.id, { reasons: REASONS }).expect(201));

      const second = await regenerate(who, parent.id, { reasons: ['face'], comment: 'other' });

      expect(second.status).toBe(200);
      expect(bodyOf(second)).toMatchObject({ id: first.id, repeated: false, status: 'pending' });
      expect(await usedOf(who.userId)).toBe(1);
      expect(await prisma().aiGeneration.count({ where: { parentId: parent.id } })).toBe(1);
      expect((await row(first.id)).comment).toBeNull();
    });

    it('makes one regeneration of parallel requests', async () => {
      const who = await actor();
      const { parent } = await completed(who);

      const responses = await Promise.all([
        regenerate(who, parent.id, { reasons: REASONS }),
        regenerate(who, parent.id, { reasons: REASONS }),
        regenerate(who, parent.id, { reasons: REASONS }),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 201]);
      expect(await prisma().aiGeneration.count({ where: { parentId: parent.id } })).toBe(1);
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('refuses a parent that is still running: 409 NOT_COMPLETED', async () => {
      const who = await actor();
      const parent = await started(who, single(who, await product()));

      const response = await regenerate(who, parent.id, { reasons: REASONS });

      expectError(response, 409, 'NOT_COMPLETED');
      expect(await prisma().aiGeneration.count({ where: { parentId: parent.id } })).toBe(0);
    });

    it('refuses a parent that failed: 409 NOT_COMPLETED', async () => {
      const who = await actor();
      const parent = await started(who, single(who, await product()));
      await endFitting(prisma(), parent.id, {
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'x',
        providerRequestId: null,
      });

      expectError(await regenerate(who, parent.id, { reasons: REASONS }), 409, 'NOT_COMPLETED');
    });

    it('refuses a parent whose photo was deleted: 409 PHOTO_GONE, and keeps its free one', async () => {
      const who = await actor();
      const { parent } = await completed(who);
      await prisma().userPhoto.delete({ where: { id: who.photoId } });

      const response = await regenerate(who, parent.id, { reasons: REASONS });

      expectError(response, 409, 'PHOTO_GONE');
      expect((await row(parent.id)).freeRegenerationUsed).toBe(false);
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('refuses a refused comment: 400 PROMPT_REFUSED, keeping the free one', async () => {
      const who = await actor();
      const { parent } = await completed(who);

      const response = await regenerate(who, parent.id, {
        reasons: REASONS,
        comment: 'refuse:moderation',
      });

      expectError(response, 400, 'PROMPT_REFUSED');
      expect(errorOf(response).message).toContain('comment');
      expect((await row(parent.id)).freeRegenerationUsed).toBe(false);
      expect(await prisma().aiGeneration.count({ where: { parentId: parent.id } })).toBe(0);
    });

    it.each(['unrelated', 'nudity', ...CATEGORY_REASONS])(
      'names the reason %s in the one detail of PROMPT_REFUSED on the comment',
      async (reason) => {
        const who = await actor();
        const { parent } = await completed(who);

        const response = await regenerate(who, parent.id, {
          reasons: REASONS,
          comment: `brighter refuse:${reason}`,
        });

        expectError(response, 400, 'PROMPT_REFUSED');
        expect(errorOf(response).details).toEqual([
          {
            field: 'comment',
            code: 'PROMPT_REFUSED',
            message: `comment was refused: ${reason}`,
          },
        ]);
        expect((await row(parent.id)).freeRegenerationUsed).toBe(false);
        expect(await usedOf(who.userId)).toBe(1);
        expect(await prisma().aiGeneration.count({ where: { parentId: parent.id } })).toBe(0);
      },
    );

    it('answers 503 for an unreadable verdict of the comment, keeping the free one (Y19)', async () => {
      const who = await actor();
      const { parent } = await completed(who);

      const response = await regenerate(who, parent.id, {
        reasons: REASONS,
        comment: 'fail:unreadable_verdict',
      });

      expectError(response, 503, 'SERVICE_UNAVAILABLE');
      expect((await row(parent.id)).freeRegenerationUsed).toBe(false);
      expect(await usedOf(who.userId)).toBe(1);
      expect(await prisma().aiGeneration.count({ where: { parentId: parent.id } })).toBe(0);
    });

    it('answers 503 when the comment check does not answer in time', async () => {
      const who = await actor();
      const { parent } = await completed(who);
      fake.delayMs = 2000;

      const response = await regenerate(who, parent.id, { reasons: REASONS, comment: 'brighter' });

      fake.delayMs = 0;
      expectError(response, 503, 'SERVICE_UNAVAILABLE');
      expect((await row(parent.id)).freeRegenerationUsed).toBe(false);
    });

    it('answers 404 for another user’s fitting, a missing one and a closed-route row', async () => {
      const one = await actor();
      const two = await actor();
      const { parent } = await completed(one);
      const session = await prisma().fittingSession.create({ data: { userId: two.userId } });
      const closed = await prisma().aiGeneration.create({
        data: {
          sessionId: session.id,
          userId: two.userId,
          status: 'pending',
          aiProvider: 'fake',
          aiModel: 'x',
        },
      });

      expectError(await regenerate(two, parent.id, { reasons: REASONS }), 404, 'NOT_FOUND');
      expectError(await regenerate(two, randomUUID(), { reasons: REASONS }), 404, 'NOT_FOUND');
      expectError(await regenerate(two, closed.id, { reasons: REASONS }), 404, 'NOT_FOUND');
      expect((await row(parent.id)).freeRegenerationUsed).toBe(false);
    });

    it.each([
      ['an empty body', {}],
      ['empty reasons', { reasons: [] }],
    ])('takes %s and stores no reasons (Y9)', async (_name, body) => {
      const who = await actor();
      const { parent } = await completed(who);

      const response = await regenerate(who, parent.id, body);

      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const stored = await row(bodyOf(response).id);
      expect(stored.regenerationReasons).toEqual([]);
      expect(stored.comment).toBeNull();
    });

    it('stores the reasons it is given and still refuses six of them', async () => {
      const who = await actor();
      const { parent } = await completed(who);

      const given = await regenerate(who, parent.id, { reasons: ['face'] });
      expect(given.status, JSON.stringify(given.body)).toBe(201);
      expect((await row(bodyOf(given).id)).regenerationReasons).toEqual(['face']);

      expectError(
        await regenerate(who, parent.id, {
          reasons: ['face', 'figure', 'item', 'background', 'other', 'face'],
        }),
        400,
        'VALIDATION_FAILED',
        { field: 'reasons', code: 'ARRAY_MAX_SIZE' },
      );
    });

    it('checks the comment with the parent’s product and category names', async () => {
      const who = await actor();
      const { parent, dress } = await completed(who);
      const category = await prisma().category.findUniqueOrThrow({ where: { id: categories.top } });
      const check = vi.spyOn(fake, 'checkPrompt');

      await regenerate(who, parent.id, { comment: 'brighter' }).expect(201);

      const calls = [...check.mock.calls];
      check.mockRestore();
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('brighter');
      expect(calls[0]?.[1]).toEqual({ items: [{ name: dress.name, category: category.name }] });
    });

    it.each([
      ['a reason that is not one', { reasons: ['hair'] }, 'reasons', 'IS_IN'],
      ['the same reason twice', { reasons: ['face', 'face'] }, 'reasons', 'ARRAY_UNIQUE'],
      [
        'a comment over 300 characters',
        { reasons: ['face'], comment: 'a'.repeat(301) },
        'comment',
        'MAX_LENGTH',
      ],
      [
        'a field it does not know',
        { reasons: ['face'], photoId: randomUUID() },
        'photoId',
        'WHITELIST_VALIDATION',
      ],
    ])('refuses %s', async (_name, body, field, code) => {
      const who = await actor();
      const { parent } = await completed(who);

      expectError(await regenerate(who, parent.id, body), 400, 'VALIDATION_FAILED', {
        field,
        code,
      });
      expect((await row(parent.id)).freeRegenerationUsed).toBe(false);
    });

    it('answers 400 for an id that is not a uuid', async () => {
      const who = await actor();

      expectError(await regenerate(who, 'nope', { reasons: REASONS }), 400, 'INVALID_ID');
    });

    it('answers a regeneration that is completed with the repeat of its parent’s request', async () => {
      const who = await actor();
      const { parent, dress } = await completed(who);
      const child = bodyOf(await regenerate(who, parent.id, { reasons: REASONS }).expect(201));
      await finish(child.id);

      const again = await start(who, single(who, dress, { promptText: 'long sleeves' }));

      expect(again.status).toBe(200);
      expect(bodyOf(again)).toMatchObject({ repeated: true });
      expect(bodyOf(again).id).toBe(child.id);
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('spends a try-on on the regeneration of a regeneration (A70)', async () => {
      const who = await actor();
      const { parent } = await completed(who);
      const child = bodyOf(await regenerate(who, parent.id, { reasons: REASONS }).expect(201));
      await finish(child.id);
      expect(bodyOf(await get(who, child.id)).regenerationFree).toBe(false);

      const grandchild = await regenerate(who, child.id, { reasons: REASONS });

      expect(grandchild.status).toBe(201);
      expect(bodyOf(grandchild)).toMatchObject({ countsAgainstLimit: true, parentId: child.id });
      expect(await usedOf(who.userId)).toBe(2);
      expect(await row(child.id)).toMatchObject({ freeRegenerationUsed: true });
    });

    it('marks a regeneration as having no free one of its own, whatever its state', async () => {
      const who = await actor();
      const { parent } = await completed(who);

      const child = bodyOf(await regenerate(who, parent.id, { reasons: REASONS }).expect(201));

      expect(child.regenerationFree).toBe(false);
      expect((await row(child.id)).freeRegenerationUsed).toBe(true);
    });

    it('does not offer a free regeneration of a completed try-on whose photo was deleted', async () => {
      const who = await actor();
      const { parent } = await completed(who);
      expect(bodyOf(await get(who, parent.id)).regenerationFree).toBe(true);

      await prisma().userPhoto.delete({ where: { id: who.photoId } });

      const body = bodyOf(await get(who, parent.id));
      expect(body).toMatchObject({ status: 'completed', photoId: null, regenerationFree: false });
    });
  });

  describe('the safety category and stage of a failed fitting (spec 0023 Y2)', () => {
    const failedBy = (
      id: string,
      failureCode: 'moderation' | 'provider_error' | 'model_timeout',
      safety?: { stage: 'input' | 'output'; category: (typeof SAFETY_CATEGORIES)[number] },
    ) =>
      endFitting(prisma(), id, {
        status: 'failed',
        failureCode,
        errorMessage: null,
        providerRequestId: null,
        ...(safety === undefined ? {} : { safety }),
      });

    it.each([
      ['output', 'sexual'],
      ['input', 'minors'],
      ['input', 'unknown'],
    ] as const)(
      'answers a moderation refusal at %s as %s on the read, the list and the row',
      async (stage, category) => {
        const who = await actor();
        const id = (await started(who, single(who, await product()))).id;
        await failedBy(id, 'moderation', { stage, category });

        const one = bodyOf(await get(who, id).expect(200));
        const listed = ((await list(who).expect(200)).body as ListBody).items[0];

        for (const body of [one, listed]) {
          expect(body).toMatchObject({
            status: 'failed',
            failureCode: 'moderation',
            failureCategory: category,
            failureStage: stage,
          });
        }
        expect(await row(id)).toMatchObject({ failureCategory: category, failureStage: stage });
      },
    );

    it('reads an older moderation row with neither column as unknown at the input', async () => {
      const who = await actor();
      const id = (await started(who, single(who, await product()))).id;
      await failedBy(id, 'moderation');
      expect(await row(id)).toMatchObject({ failureCategory: null, failureStage: null });

      const body = bodyOf(await get(who, id).expect(200));

      expect(body).toMatchObject({
        failureCode: 'moderation',
        failureCategory: 'unknown',
        failureStage: 'input',
      });
    });

    it.each(['provider_error', 'model_timeout'] as const)(
      'answers null for both on a %s failure',
      async (failureCode) => {
        const who = await actor();
        const id = (await started(who, single(who, await product()))).id;
        await failedBy(id, failureCode);

        expect(bodyOf(await get(who, id).expect(200))).toMatchObject({
          failureCode,
          failureCategory: null,
          failureStage: null,
        });
      },
    );

    it('answers null for both on a pending and on a completed fitting', async () => {
      const who = await actor();
      const pending = await started(who, single(who, await product()));
      const done = await started(who, single(who, await product()));
      await finish(done.id);

      expect(pending).toMatchObject({ failureCategory: null, failureStage: null });
      expect(bodyOf(await get(who, done.id).expect(200))).toMatchObject({
        status: 'completed',
        failureCategory: null,
        failureStage: null,
      });
    });

    it('never stores a category for a failure other than moderation', async () => {
      const who = await actor();
      const id = (await started(who, single(who, await product()))).id;

      await failedBy(id, 'provider_error', { stage: 'output', category: 'hate' });

      expect(await row(id)).toMatchObject({
        status: 'failed',
        failureCategory: null,
        failureStage: null,
      });
    });
  });

  describe('the wishes and the slots in the answer (spec 0019 T26, A92.1)', () => {
    const slotsOf = (body: FittingBody) =>
      Object.fromEntries(body.items.map((item) => [item.productId, item.slot]));

    it('answers a look’s wishes and its items’ slots on the start, the read and the list', async () => {
      const who = await actor();
      const shirt = await product('top');
      const jeans = await product('bottom');

      const startedBody = await started(
        who,
        look(who, [shirt, jeans], { promptText: 'tuck the shirt in' }),
      );

      const expectedSlots = { [shirt.id]: 'top', [jeans.id]: 'bottom' };
      expect(startedBody.promptText).toBe('tuck the shirt in');
      expect(slotsOf(startedBody)).toEqual(expectedSlots);
      const one = bodyOf(await get(who, startedBody.id).expect(200));
      expect(one.promptText).toBe('tuck the shirt in');
      expect(slotsOf(one)).toEqual(expectedSlots);
      const listed = (await list(who).expect(200)).body as ListBody;
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0]?.promptText).toBe('tuck the shirt in');
      expect(slotsOf(listed.items[0]!)).toEqual(expectedSlots);
    });

    it('answers null for a fitting started with no wishes, on the start, the read and the list', async () => {
      const who = await actor();

      const startedBody = await started(who, single(who, await product('bottom')));

      expect(startedBody.promptText).toBeNull();
      expect(startedBody.items[0]?.slot).toBe('bottom');
      expect(bodyOf(await get(who, startedBody.id)).promptText).toBeNull();
      const listed = (await list(who).expect(200)).body as ListBody;
      expect(listed.items[0]?.promptText).toBeNull();
    });

    it('answers null for wishes that were only spaces, and the trimmed text for padded ones', async () => {
      const who = await actor();
      const blank = await started(who, single(who, await product(), { promptText: '   ' }));
      const padded = await started(who, single(who, await product(), { promptText: '  bright  ' }));

      expect(blank.promptText).toBeNull();
      expect(bodyOf(await get(who, blank.id)).promptText).toBeNull();
      expect(padded.promptText).toBe('bright');
      expect(bodyOf(await get(who, padded.id)).promptText).toBe('bright');
    });

    it('gives a regeneration its parent’s wishes and slots, not its comment', async () => {
      const who = await actor();
      const shirt = await product('top');
      const jeans = await product('bottom');
      const parent = await started(who, look(who, [shirt, jeans], { promptText: 'long sleeves' }));
      await finish(parent.id);

      const child = bodyOf(
        await regenerate(who, parent.id, { reasons: REASONS, comment: 'brighter' }).expect(201),
      );

      expect(child.promptText).toBe('long sleeves');
      expect(slotsOf(child)).toEqual({ [shirt.id]: 'top', [jeans.id]: 'bottom' });
      expect(bodyOf(await get(who, child.id)).promptText).toBe('long sleeves');
    });

    it('gives a regeneration of a result with no wishes null', async () => {
      const who = await actor();
      const parent = await started(who, single(who, await product()));
      await finish(parent.id);

      const child = bodyOf(await regenerate(who, parent.id, { reasons: REASONS }).expect(201));

      expect(child.promptText).toBeNull();
    });

    it('answers a repeat with the wishes and the slots of the result it opens', async () => {
      const who = await actor();
      const shirt = await product('top');
      const jeans = await product('bottom');
      const first = await started(who, look(who, [shirt, jeans], { promptText: 'bright' }));
      await finish(first.id);

      const again = await start(who, look(who, [jeans, shirt], { promptText: 'bright' }));

      expect(again.status).toBe(200);
      expect(bodyOf(again)).toMatchObject({ id: first.id, repeated: true, promptText: 'bright' });
      expect(slotsOf(bodyOf(again))).toEqual({ [shirt.id]: 'top', [jeans.id]: 'bottom' });
    });

    it('answers a colour change with the wishes of the result it came from sent again', async () => {
      const who = await actor();
      const shirt = await product('top', 2);
      const jeans = await product('bottom');
      const base = await started(
        who,
        look(who, [shirt, jeans], {
          items: [
            { productId: shirt.id, attributeValueId: shirt.colours[0] },
            { productId: jeans.id },
          ],
          promptText: 'bright',
        }),
      );
      await finish(base.id);

      const other = await started(
        who,
        look(who, [shirt, jeans], {
          items: [
            { productId: shirt.id, attributeValueId: shirt.colours[1] },
            { productId: jeans.id },
          ],
          promptText: bodyOf(await get(who, base.id)).promptText,
        }),
      );

      expect(other.id).not.toBe(base.id);
      expect(other.promptText).toBe('bright');
      expect(other.items.find((item) => item.productId === shirt.id)?.attributeValueId).toBe(
        shirt.colours[1],
      );
      expect(await usedOf(who.userId)).toBe(2);
    });
  });

  describe('the limit before the paid text check (A16, A45, A70)', () => {
    beforeEach(() => {
      settings.monthlyLimit = 2;
    });

    async function checksDuring(run: () => Promise<request.Response>) {
      const check = vi.spyOn(fake, 'checkPrompt');
      try {
        const response = await run();
        return { response, called: check.mock.calls.length };
      } finally {
        check.mockRestore();
      }
    }

    it('refuses a start with new wishes at the limit with 409, without calling the check', async () => {
      const who = await actor();
      const dress = await product();
      await setUsed(who.userId, 2);

      const { response, called } = await checksDuring(() =>
        start(who, single(who, dress, { promptText: 'bright' })),
      );

      expectError(response, 409, 'LIMIT_REACHED');
      expect(called).toBe(0);
      expect(await rowsOf(who.userId)).toEqual([]);
    });

    it('answers LIMIT_REACHED, not PROMPT_REFUSED, to a refused text at the limit', async () => {
      const who = await actor();
      await setUsed(who.userId, 2);

      const dress = await product();
      const { response, called } = await checksDuring(() =>
        start(who, single(who, dress, { promptText: 'refuse:moderation' })),
      );

      expectError(response, 409, 'LIMIT_REACHED');
      expect(called).toBe(0);
    });

    it('still checks the text below the limit', async () => {
      const who = await actor();
      await setUsed(who.userId, 1);

      const dress = await product();
      const { response, called } = await checksDuring(() =>
        start(who, single(who, dress, { promptText: 'bright' })),
      );

      expect(response.status).toBe(201);
      expect(called).toBe(1);
    });

    it('refuses a paid regeneration with a comment at the limit, without calling the check', async () => {
      const who = await actor();
      const parent = await started(who, single(who, await product()));
      await finish(parent.id);
      await prisma().aiGeneration.update({
        where: { id: parent.id },
        data: { freeRegenerationUsed: true },
      });
      await setUsed(who.userId, 2);

      const { response, called } = await checksDuring(() =>
        regenerate(who, parent.id, { reasons: REASONS, comment: 'brighter' }),
      );

      expectError(response, 409, 'LIMIT_REACHED');
      expect(called).toBe(0);
      expect(await prisma().aiGeneration.count({ where: { parentId: parent.id } })).toBe(0);
    });

    it('lets a free regeneration with a comment through at the limit, and checks the comment', async () => {
      const who = await actor();
      const parent = await started(who, single(who, await product()));
      await finish(parent.id);
      await setUsed(who.userId, 2);

      const { response, called } = await checksDuring(() =>
        regenerate(who, parent.id, { reasons: REASONS, comment: 'brighter' }),
      );

      expect(response.status).toBe(201);
      expect(bodyOf(response).countsAgainstLimit).toBe(false);
      expect(called).toBe(1);
      expect(await usedOf(who.userId)).toBe(2);
    });
  });

  describe('DELETE /fittings/:id (A25, A47)', () => {
    it('deletes a running fitting, queues its files, keeps the unit spent and cancels the workflow', async () => {
      const who = await actor();
      const running = await started(who, single(who, await product()));

      const response = await remove(who, running.id);

      expect(response.status).toBe(204);
      expect(await prisma().aiGeneration.findUnique({ where: { id: running.id } })).toBeNull();
      const outbox = await prisma().fileDeletion.findMany({ where: { rowId: running.id } });
      expect(outbox).toEqual([
        expect.objectContaining({
          kind: 'generation',
          rowId: running.id,
          prefixes: [generationFolder(who.userId, running.id)],
        }),
      ]);
      expect(await usedOf(who.userId)).toBe(1);
      expect(await cancelRequested(running.id)).toBe(true);
      expect((await get(who, running.id)).status).toBe(404);
    });

    it('deletes a finished fitting without touching a workflow', async () => {
      const who = await actor();
      const done = await started(who, single(who, await product()));
      await finish(done.id);
      const cancel = vi.spyOn(testApp.app.get(WorkflowStarter), 'cancel');

      const response = await remove(who, done.id);

      const cancelled = cancel.mock.calls.length;
      cancel.mockRestore();
      expect(response.status).toBe(204);
      expect(cancelled).toBe(0);
      expect(await prisma().aiGeneration.findUnique({ where: { id: done.id } })).toBeNull();
      expect(
        await prisma().fileDeletion.count({ where: { kind: 'generation', rowId: done.id } }),
      ).toBe(1);
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('answers 204 when the workflow cannot be cancelled', async () => {
      const who = await actor();
      const running = await started(who, single(who, await product()));
      const cancel = vi
        .spyOn(testApp.app.get(WorkflowStarter), 'cancel')
        .mockRejectedValueOnce(new Error('temporal down'));

      const response = await remove(who, running.id);

      cancel.mockRestore();
      expect(response.status).toBe(204);
      expect(await prisma().aiGeneration.findUnique({ where: { id: running.id } })).toBeNull();
    });

    it('cancels the workflow and starts the file deletion side by side, not one after the other', async () => {
      const who = await actor();
      const running = await started(who, single(who, await product()));
      const slow = () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 1500);
        });
      const cancel = vi.spyOn(testApp.app.get(WorkflowStarter), 'cancel').mockImplementation(slow);
      const files = vi.spyOn(testApp.app.get(FileDeletion), 'start').mockImplementation(slow);

      const began = Date.now();
      const response = await remove(who, running.id);
      const took = Date.now() - began;

      const calls = { cancel: cancel.mock.calls.length, files: files.mock.calls.length };
      cancel.mockRestore();
      files.mockRestore();
      expect(response.status).toBe(204);
      expect(calls).toEqual({ cancel: 1, files: 1 });
      expect(took).toBeGreaterThanOrEqual(1400);
      expect(took).toBeLessThan(2500);
    });

    it('deletes the regenerations’ link, not the regenerations, with their parent', async () => {
      const who = await actor();
      const parent = await started(who, single(who, await product(), { promptText: 'x' }));
      await finish(parent.id);
      const child = bodyOf(await regenerate(who, parent.id, { reasons: REASONS }).expect(201));

      await remove(who, parent.id).expect(204);

      expect(bodyOf(await get(who, child.id)).parentId).toBeNull();
    });

    it('answers 404 for another user’s fitting and leaves it', async () => {
      const one = await actor();
      const two = await actor();
      const mine = await started(one, single(one, await product()));

      const response = await remove(two, mine.id);

      expectError(response, 404, 'NOT_FOUND');
      expect(await prisma().aiGeneration.findUnique({ where: { id: mine.id } })).not.toBeNull();
      expect(await prisma().fileDeletion.count({ where: { rowId: mine.id } })).toBe(0);
      expect(await cancelRequested(mine.id)).toBe(false);
    });

    it('answers 404 for a missing fitting and for a closed-route row', async () => {
      const who = await actor();
      const session = await prisma().fittingSession.create({ data: { userId: who.userId } });
      const closed = await prisma().aiGeneration.create({
        data: {
          sessionId: session.id,
          userId: who.userId,
          status: 'pending',
          aiProvider: 'fake',
          aiModel: 'x',
        },
      });

      expectError(await remove(who, randomUUID()), 404, 'NOT_FOUND');
      expectError(await remove(who, closed.id), 404, 'NOT_FOUND');
      expect(await prisma().aiGeneration.findUnique({ where: { id: closed.id } })).not.toBeNull();
    });

    it('answers 401 to an anonymous visitor', async () => {
      const response = await http().delete(`/fittings/${randomUUID()}`);

      expectError(response, 401, 'UNAUTHORIZED');
    });
  });

  describe('GET /fittings', () => {
    it('lists the user’s fittings newest first, with the total on the first batch', async () => {
      const who = await actor();
      const ids: string[] = [];
      for (let index = 0; index < 3; index++) {
        ids.push((await started(who, single(who, await product()))).id);
      }

      const response = await list(who);

      expect(response.status).toBe(200);
      const body = response.body as ListBody;
      expect(body.items.map((item) => item.id)).toEqual([...ids].reverse());
      expect(body.total).toBe(3);
      expect(body.nextCursor).toBeNull();
      expect(body.items[0]).toMatchObject({
        status: 'pending',
        stage: 'queued',
        estimatedSeconds: 25,
        items: [expect.objectContaining({ name: expect.any(String) })],
      });
    });

    it('pages by cursor: total only on the first batch, the cursor ends with the last', async () => {
      const who = await actor();
      const ids: string[] = [];
      for (let index = 0; index < 5; index++) {
        ids.push((await started(who, single(who, await product()))).id);
      }
      const newest = [...ids].reverse();

      const first = (await list(who, '?limit=2')).body as ListBody;
      const second = (await list(who, `?limit=2&cursor=${first.nextCursor}`)).body as ListBody;
      const third = (await list(who, `?limit=2&cursor=${second.nextCursor}`)).body as ListBody;

      expect(first.items.map((item) => item.id)).toEqual(newest.slice(0, 2));
      expect(first.total).toBe(5);
      expect(first.nextCursor).toEqual(expect.any(String));
      expect(second.items.map((item) => item.id)).toEqual(newest.slice(2, 4));
      expect(second.total).toBeNull();
      expect(second.nextCursor).toEqual(expect.any(String));
      expect(third.items.map((item) => item.id)).toEqual(newest.slice(4));
      expect(third.total).toBeNull();
      expect(third.nextCursor).toBeNull();
    });

    it('gives no cursor when the batch is exactly the rest', async () => {
      const who = await actor();
      for (let index = 0; index < 2; index++) {
        await started(who, single(who, await product()));
      }

      const body = (await list(who, '?limit=2')).body as ListBody;

      expect(body.items).toHaveLength(2);
      expect(body.nextCursor).toBeNull();
    });

    it('pages without losing or repeating a row when new ones arrive between batches', async () => {
      const who = await actor();
      const ids: string[] = [];
      for (let index = 0; index < 3; index++) {
        ids.push((await started(who, single(who, await product()))).id);
      }
      const first = (await list(who, '?limit=2')).body as ListBody;
      await started(who, single(who, await product()));

      const second = (await list(who, `?limit=2&cursor=${first.nextCursor}`)).body as ListBody;

      expect(second.items.map((item) => item.id)).toEqual([ids[0]]);
    });

    it('filters by kind and counts only that kind', async () => {
      const who = await actor();
      const one = await started(who, single(who, await product()));
      const outfit = await started(who, look(who, [await product('top'), await product('bottom')]));

      const singles = (await list(who, '?kind=single')).body as ListBody;
      const looks = (await list(who, '?kind=look')).body as ListBody;

      expect(singles.items.map((item) => item.id)).toEqual([one.id]);
      expect(singles.total).toBe(1);
      expect(looks.items.map((item) => item.id)).toEqual([outfit.id]);
      expect(looks.total).toBe(1);
    });

    it('lists no fitting of another user and none of the closed route', async () => {
      const who = await actor();
      const other = await actor();
      await started(other, single(other, await product()));
      const mine = await started(who, single(who, await product()));
      const session = await prisma().fittingSession.findFirstOrThrow({
        where: { userId: who.userId, isActive: true },
      });
      const closed = await prisma().aiGeneration.create({
        data: {
          sessionId: session.id,
          userId: who.userId,
          status: 'pending',
          aiProvider: 'fake',
          aiModel: 'x',
        },
      });

      const body = (await list(who)).body as ListBody;

      expect(body.items.map((item) => item.id)).toEqual([mine.id]);
      expect(body.items.map((item) => item.id)).not.toContain(closed.id);
      expect(body.total).toBe(1);
    });

    it('answers an empty list for a user with none', async () => {
      const who = await actor();

      const response = await list(who);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [], total: 0, nextCursor: null });
    });

    it('answers 400 INVALID_CURSOR for a cursor that is not one', async () => {
      const who = await actor();

      expectError(await list(who, '?cursor=garbage'), 400, 'VALIDATION_FAILED', {
        field: 'cursor',
        code: 'INVALID_CURSOR',
      });
      expectError(
        await list(who, `?cursor=${Buffer.from('{}').toString('base64url')}`),
        400,
        'VALIDATION_FAILED',
        {
          field: 'cursor',
          code: 'INVALID_CURSOR',
        },
      );
    });

    it('answers 400 for offset, which this list does not know', async () => {
      const who = await actor();

      expect((await list(who, '?offset=1')).status).toBe(400);
    });

    it('answers 400 for a kind that is not one and for a limit out of range', async () => {
      const who = await actor();

      expect((await list(who, '?kind=outfit')).status).toBe(400);
      expect((await list(who, '?limit=0')).status).toBe(400);
    });

    it('answers 401 to an anonymous visitor', async () => {
      expectError(await http().get('/fittings'), 401, 'UNAUTHORIZED');
    });
  });

  describe('GET /fittings/:id', () => {
    it('answers one’s own fitting', async () => {
      const who = await actor();
      const dress = await product();
      const made = await started(who, single(who, dress));

      const response = await get(who, made.id);

      expect(response.status).toBe(200);
      expect(bodyOf(response)).toMatchObject({ id: made.id, status: 'pending' });
      expect(bodyOf(response).repeated).toBeUndefined();
    });

    it('answers 404 for another user’s fitting, a missing one and a closed-route row', async () => {
      const one = await actor();
      const two = await actor();
      const made = await started(one, single(one, await product()));
      const session = await prisma().fittingSession.create({ data: { userId: two.userId } });
      const closed = await prisma().aiGeneration.create({
        data: {
          sessionId: session.id,
          userId: two.userId,
          status: 'pending',
          aiProvider: 'fake',
          aiModel: 'x',
        },
      });

      expectError(await get(two, made.id), 404, 'NOT_FOUND');
      expectError(await get(two, randomUUID()), 404, 'NOT_FOUND');
      expectError(await get(two, closed.id), 404, 'NOT_FOUND');
    });

    it('answers 400 for an id that is not a uuid', async () => {
      const who = await actor();

      expectError(await get(who, 'nope'), 400, 'INVALID_ID');
    });

    it('answers 25 seconds to a running fitting with no history, and null to an ended one (A27)', async () => {
      const who = await actor();
      const running = await started(who, single(who, await product()));
      const done = await started(who, single(who, await product()));

      expect(bodyOf(await get(who, running.id)).estimatedSeconds).toBe(25);
      await finish(done.id);
      const ended = bodyOf(await get(who, done.id));
      expect(ended).toMatchObject({ status: 'completed', estimatedSeconds: null, stage: 'done' });
      expect(ended.resultUrl).toContain(generationResultKey(who.userId, done.id));
    });

    it('estimates a running fitting by the median of the last completed ones (A27)', async () => {
      const who = await actor();
      for (const seconds of [10, 30, 20]) {
        const made = await started(who, single(who, await product()));
        await finish(made.id);
        const createdAt = new Date(Date.now() - 3_600_000);
        await prisma().aiGeneration.update({
          where: { id: made.id },
          data: { createdAt, finishedAt: new Date(createdAt.getTime() + seconds * 1000) },
        });
      }
      const running = await started(who, single(who, await product()));

      expect(bodyOf(await get(who, running.id)).estimatedSeconds).toBe(20);
      const listed = (await list(who)).body as ListBody;
      expect(listed.items[0]).toMatchObject({ id: running.id, estimatedSeconds: 20 });
      expect(listed.items.slice(1).every((item) => item.estimatedSeconds === null)).toBe(true);
    });

    it('answers a failed fitting with its failure code and no result', async () => {
      const who = await actor();
      const made = await started(who, single(who, await product()));
      await endFitting(prisma(), made.id, {
        status: 'failed',
        failureCode: 'moderation',
        errorMessage: null,
        providerRequestId: null,
      });

      const body = bodyOf(await get(who, made.id));

      expect(body).toMatchObject({
        status: 'failed',
        stage: 'done',
        failureCode: 'moderation',
        countsAgainstLimit: false,
        resultUrl: null,
        estimatedSeconds: null,
        regenerationFree: false,
      });
      expect(body.finishedAt).not.toBeNull();
    });
  });

  describe('a workflow that does not start (plan §4)', () => {
    it('ends the fitting failed with provider_error and gives the unit back', async () => {
      const who = await actor();
      const dress = await product();
      const spy = vi
        .spyOn(testApp.app.get(WorkflowStarter), 'start')
        .mockRejectedValueOnce(new Error('temporal down'));

      const response = await start(who, single(who, dress));

      spy.mockRestore();
      expect(response.status).toBe(201);
      expect(bodyOf(response)).toMatchObject({
        status: 'failed',
        stage: 'done',
        failureCode: 'provider_error',
        countsAgainstLimit: false,
        repeated: false,
        estimatedSeconds: null,
      });
      expect(await row(bodyOf(response).id)).toMatchObject({
        status: 'failed',
        failureCode: 'provider_error',
        countsAgainstLimit: false,
      });
      expect(await usedOf(who.userId)).toBe(0);
      await started(who, single(who, dress));
    });

    it('leaves a row its worker already took to the workflow: processing, the unit spent', async () => {
      const who = await actor();
      const spy = vi
        .spyOn(testApp.app.get(WorkflowStarter), 'start')
        .mockImplementationOnce(async () => {
          // A start that timed out on our side but reached Temporal: the worker took the row.
          await prisma().aiGeneration.updateMany({
            where: { userId: who.userId, status: 'pending' },
            data: { status: 'processing' },
          });
          throw new Error('deadline exceeded');
        });

      const response = await start(who, single(who, await product()));

      spy.mockRestore();
      expect(response.status).toBe(201);
      expect(bodyOf(response)).toMatchObject({
        status: 'processing',
        stage: 'generating',
        failureCode: null,
        countsAgainstLimit: true,
      });
      expect(await row(bodyOf(response).id)).toMatchObject({
        status: 'processing',
        failureCode: null,
        countsAgainstLimit: true,
      });
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('answers a row deleted before the failed start was handled as committed, not 404', async () => {
      const who = await actor();
      const spy = vi
        .spyOn(testApp.app.get(WorkflowStarter), 'start')
        .mockImplementationOnce(async () => {
          await prisma().aiGeneration.deleteMany({ where: { userId: who.userId } });
          throw new Error('temporal down');
        });

      const response = await start(who, single(who, await product()));

      spy.mockRestore();
      expect(response.status).toBe(201);
      expect(bodyOf(response)).toMatchObject({ status: 'pending', stage: 'queued' });
      expect(await rowsOf(who.userId)).toEqual([]);
      expect(await usedOf(who.userId)).toBe(1);
    });

    it('gives the parent’s free regeneration back when a free regeneration does not start', async () => {
      const who = await actor();
      const made = await started(who, single(who, await product()));
      await finish(made.id);
      const spy = vi
        .spyOn(testApp.app.get(WorkflowStarter), 'start')
        .mockRejectedValueOnce(new Error('temporal down'));

      const response = await regenerate(who, made.id, { reasons: REASONS });

      spy.mockRestore();
      expect(response.status).toBe(201);
      expect(bodyOf(response)).toMatchObject({ status: 'failed', failureCode: 'provider_error' });
      expect(await usedOf(who.userId)).toBe(1);
      expect(bodyOf(await get(who, made.id)).regenerationFree).toBe(true);
    });

    it('gives a paid regeneration’s unit back when it does not start', async () => {
      const who = await actor();
      const made = await started(who, single(who, await product()));
      await finish(made.id);
      const free = bodyOf(await regenerate(who, made.id, { reasons: REASONS }).expect(201));
      await finish(free.id);
      const spy = vi
        .spyOn(testApp.app.get(WorkflowStarter), 'start')
        .mockRejectedValueOnce(new Error('temporal down'));

      const response = await regenerate(who, made.id, { reasons: REASONS });

      spy.mockRestore();
      expect(bodyOf(response)).toMatchObject({ status: 'failed' });
      expect(await usedOf(who.userId)).toBe(1);
      expect(bodyOf(await get(who, made.id)).regenerationFree).toBe(false);
    });
  });

  describe('DELETE /me/photos/transient/:id (A69, A70)', () => {
    const remove = (who: SignedIn, id: string) =>
      http().delete(`/me/photos/transient/${id}`).set({ Cookie: who.cookie });

    it('deletes a one-time photo, queues its file and answers 204', async () => {
      const who = await actor({ transient: true });
      const photo = await prisma().userPhoto.findUniqueOrThrow({ where: { id: who.photoId } });

      const response = await remove(who, who.photoId);

      expect(response.status).toBe(204);
      expect(await prisma().userPhoto.findUnique({ where: { id: who.photoId } })).toBeNull();
      expect(await prisma().fileDeletion.findMany({ where: { rowId: who.photoId } })).toEqual([
        expect.objectContaining({ kind: 'photo', prefixes: [photo.imageKey] }),
      ]);
    });

    it('keeps a photo a running fitting uses, answering 204 all the same', async () => {
      const who = await actor({ transient: true });
      await started(who, single(who, await product()));

      const response = await remove(who, who.photoId);

      expect(response.status).toBe(204);
      expect(await prisma().userPhoto.findUnique({ where: { id: who.photoId } })).not.toBeNull();
      expect(await prisma().fileDeletion.count({ where: { rowId: who.photoId } })).toBe(0);
    });

    it('deletes the photo of a fitting that ended, and the fitting keeps its result', async () => {
      const who = await actor({ transient: true });
      const made = await started(who, single(who, await product()));
      await finish(made.id);

      await remove(who, who.photoId).expect(204);

      expect(await prisma().userPhoto.findUnique({ where: { id: who.photoId } })).toBeNull();
      expect(bodyOf(await get(who, made.id))).toMatchObject({ status: 'completed', photoId: null });
    });

    it('answers 404 for a saved photo and keeps it', async () => {
      const who = await actor();

      const response = await remove(who, who.photoId);

      expectError(response, 404, 'NOT_FOUND');
      expect(await prisma().userPhoto.findUnique({ where: { id: who.photoId } })).not.toBeNull();
      expect(await prisma().fileDeletion.count({ where: { rowId: who.photoId } })).toBe(0);
    });

    it('answers 404 for another user’s photo and a missing one', async () => {
      const one = await actor({ transient: true });
      const two = await actor();

      expectError(await remove(two, one.photoId), 404, 'NOT_FOUND');
      expectError(await remove(two, randomUUID()), 404, 'NOT_FOUND');
      expect(await prisma().userPhoto.findUnique({ where: { id: one.photoId } })).not.toBeNull();
    });

    it('answers 401 to an anonymous visitor', async () => {
      expectError(await http().delete(`/me/photos/transient/${randomUUID()}`), 401, 'UNAUTHORIZED');
    });
  });

  describe('the closed routes (A65)', () => {
    it('answers 401 to a signed-in user on POST and PATCH /fitting-sessions', async () => {
      const who = await actor();
      const session = await prisma().fittingSession.create({ data: { userId: who.userId } });

      const created = await http()
        .post('/fitting-sessions')
        .set({ Cookie: who.cookie })
        .send({ title: 'x' });
      const patched = await http()
        .patch(`/fitting-sessions/${session.id}`)
        .set({ Cookie: who.cookie })
        .send({ title: 'y' });

      expectError(created, 401, 'UNAUTHORIZED');
      expectError(patched, 401, 'UNAUTHORIZED');
      expect(
        (await prisma().fittingSession.findUniqueOrThrow({ where: { id: session.id } })).title,
      ).toBeNull();
    });
  });

  describe('GET /me/fitting-quota', () => {
    it('answers 401 to an anonymous visitor', async () => {
      expectError(await http().get('/me/fitting-quota'), 401, 'UNAUTHORIZED');
    });

    it('reads the limit from the settings', async () => {
      const who = await actor();
      settings.monthlyLimit = 7;

      expect((await quota(who)).body).toMatchObject({ limit: 7, used: 0, left: 7 });
    });

    it('never answers a negative balance when the limit was lowered below the spend', async () => {
      const who = await actor();
      await setUsed(who.userId, 5);
      settings.monthlyLimit = 3;

      expect((await quota(who)).body).toMatchObject({ limit: 3, used: 5, left: 0 });
    });
  });
});
