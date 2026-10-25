import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Auth } from '../../src/auth/auth.js';
import { AUTH } from '../../src/auth/auth.module.js';
import type { OutfitSlot } from '../../src/generated/prisma/enums.js';
import { signIn, type SignedIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

interface Detail {
  field: string;
  code: string;
}
interface ErrorBody {
  error: { code: string; details: Detail[] };
}
interface Item {
  slot: string;
  product: Record<string, unknown> & { id: string; finalPrice: number };
  attributeValueId: string | null;
  colour: string | null;
}
interface Room {
  items: Item[];
  count: number;
  sum: number;
}
interface Change {
  room: Room;
  replaced: Item | null;
}

const SLOT_ORDER: OutfitSlot[] = ['top', 'bottom', 'outerwear', 'shoes', 'accessory'];

describe('/me/fitting-room (spec 0019 A86, AC13, AC28)', () => {
  let testApp: TestApp;
  let cookieNames: string[];
  let sessionData: string;
  const tag = randomUUID();
  const categories = new Map<OutfitSlot, string>();
  let noSlotCategoryId: string;
  let brandId: string;
  let attributeId: string;
  const colours: Record<'red' | 'blue' | 'striped' | 'season', string> = {
    red: '',
    blue: '',
    striped: '',
    season: '',
  };

  beforeAll(async () => {
    testApp = await createTestApp({ access: 'production' });
    const { authCookies } = await testApp.app.get<Auth>(AUTH).$context;
    cookieNames = [
      authCookies.sessionToken.name,
      authCookies.sessionData.name,
      authCookies.dontRememberToken.name,
    ];
    sessionData = authCookies.sessionData.name;
    const { prisma } = testApp;
    for (const slot of SLOT_ORDER.filter((s) => s !== 'accessory')) {
      const category = await prisma.category.create({
        data: { name: `Room ${slot} ${tag}`, slug: `room-${slot}-${tag}`, isActive: true, slot },
      });
      categories.set(slot, category.id);
    }
    noSlotCategoryId = (
      await prisma.category.create({
        data: { name: `Room none ${tag}`, slug: `room-none-${tag}`, isActive: true },
      })
    ).id;
    brandId = (await prisma.brand.create({ data: { name: `Room brand ${tag}` } })).id;
    attributeId = (await prisma.attribute.create({ data: { name: `Room colour ${tag}` } })).id;
    colours.red = (
      await prisma.attributeValue.create({
        data: { attributeId, value: 'Красный', colorHex: '#FF0000' },
      })
    ).id;
    colours.blue = (
      await prisma.attributeValue.create({
        data: { attributeId, value: 'Синий', colorHex: '#0000FF' },
      })
    ).id;
    colours.striped = (
      await prisma.attributeValue.create({ data: { attributeId, value: 'в полоску' } })
    ).id;
    const seasonAttributeId = (
      await prisma.attribute.create({ data: { name: `Room season ${tag}` } })
    ).id;
    colours.season = (
      await prisma.attributeValue.create({
        data: { attributeId: seasonAttributeId, value: 'демисезон' },
      })
    ).id;
  });

  afterAll(async () => {
    await testApp.close();
  });

  const http = () => request(testApp.app.getHttpServer());
  const as = (who: SignedIn) => ({ Cookie: who.cookie });

  async function product(
    categoryId: string,
    options: { price?: number; discount?: number; colourIds?: string[] } = {},
  ) {
    const created = await testApp.prisma.product.create({
      data: {
        article: `room-${randomUUID()}`,
        name: `Room product ${randomUUID()}`,
        price: options.price ?? 1000,
        discount: options.discount ?? 0,
        brandId,
        categoryId,
        attributeValues: {
          create: (options.colourIds ?? []).map((attributeValueId) => ({ attributeValueId })),
        },
      },
    });
    return created;
  }

  const inSlot = (slot: OutfitSlot, options?: Parameters<typeof product>[1]) => {
    const id = categories.get(slot);
    if (id === undefined) throw new Error(`no category for ${slot}`);
    return product(id, options);
  };

  const put = (who: SignedIn, slot: string, body: object) =>
    http().put(`/me/fitting-room/${slot}`).set(as(who)).send(body);
  const room = async (who: SignedIn) =>
    (await http().get('/me/fitting-room').set(as(who)).expect(200)).body as Room;
  const rowsOf = (userId: string) => testApp.prisma.fittingRoomItem.findMany({ where: { userId } });
  const errorOf = (response: request.Response) => (response.body as ErrorBody).error;

  describe('GET', () => {
    it('answers 401 signed out', async () => {
      const response = await http().get('/me/fitting-room');

      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('UNAUTHORIZED');
    });

    it('answers an empty room', async () => {
      const who = await signIn(testApp.app);

      const response = await http().get('/me/fitting-room').set(as(who));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [], count: 0, sum: 0 });
    });

    it('lists the items in slot order whatever the insert order, with the catalog shape', async () => {
      const who = await signIn(testApp.app);
      const shoes = await inSlot('shoes', { price: 2000, discount: 50 });
      const top = await inSlot('top', { price: 1000, colourIds: [colours.red] });
      const outerwear = await inSlot('outerwear', { price: 3000 });
      const bottom = await inSlot('bottom', { price: 500 });
      await put(who, 'shoes', { productId: shoes.id }).expect(200);
      await put(who, 'top', { productId: top.id, attributeValueId: colours.red }).expect(200);
      await put(who, 'outerwear', { productId: outerwear.id }).expect(200);
      await put(who, 'bottom', { productId: bottom.id }).expect(200);

      const body = await room(who);

      expect(body.items.map((item) => item.slot)).toEqual(['top', 'bottom', 'outerwear', 'shoes']);
      expect(body.count).toBe(4);
      expect(body.sum).toBe(1000 + 500 + 3000 + 1000);
      const first = body.items[0];
      expect(first).toMatchObject({
        slot: 'top',
        attributeValueId: colours.red,
        colour: 'Красный',
      });
      expect(first?.product).toMatchObject({
        id: top.id,
        name: top.name,
        brand: { id: brandId, name: `Room brand ${tag}` },
        price: 1000,
        discount: 0,
        finalPrice: 1000,
        image: null,
      });
      expect(first?.product['category']).toEqual({
        id: categories.get('top'),
        name: `Room top ${tag}`,
        slug: `room-top-${tag}`,
      });
      expect(body.items[3]).toMatchObject({ slot: 'shoes', attributeValueId: null, colour: null });
      expect(body.items[3]?.product.finalPrice).toBe(1000);
    });
  });

  describe('PUT /:slot', () => {
    it('answers 401 signed out', async () => {
      const response = await http().put('/me/fitting-room/top').send({ productId: randomUUID() });

      expect(response.status).toBe(401);
    });

    it('fills an empty slot: replaced is null', async () => {
      const who = await signIn(testApp.app);
      const top = await inSlot('top', { colourIds: [colours.blue] });

      const response = await put(who, 'top', { productId: top.id, attributeValueId: colours.blue });

      expect(response.status).toBe(200);
      const body = response.body as Change;
      expect(body.replaced).toBeNull();
      expect(body.room.count).toBe(1);
      expect(body.room.items[0]).toMatchObject({
        slot: 'top',
        attributeValueId: colours.blue,
        colour: 'Синий',
      });
      expect(await rowsOf(who.userId)).toHaveLength(1);
    });

    it('leaving attributeValueId out answers 200 with a null colour', async () => {
      const who = await signIn(testApp.app);
      const top = await inSlot('top', { colourIds: [colours.red] });

      const response = await put(who, 'top', { productId: top.id });

      expect(response.status).toBe(200);
      expect((response.body as Change).room.items[0]).toMatchObject({
        attributeValueId: null,
        colour: null,
      });
    });

    it('still accepts a colour value when the product also has a non-colour one', async () => {
      const who = await signIn(testApp.app);
      const top = await inSlot('top', { colourIds: [colours.season, colours.blue] });

      const response = await put(who, 'top', { productId: top.id, attributeValueId: colours.blue });

      expect(response.status).toBe(200);
      expect((response.body as Change).room.items[0]).toMatchObject({
        attributeValueId: colours.blue,
        colour: 'Синий',
      });
    });

    it('accepts a value of the colour attribute with no swatch as a colour (A91)', async () => {
      const who = await signIn(testApp.app);
      const top = await inSlot('top', { colourIds: [colours.red, colours.striped] });

      const response = await put(who, 'top', {
        productId: top.id,
        attributeValueId: colours.striped,
      });

      expect(response.status).toBe(200);
      expect((response.body as Change).room.items[0]).toMatchObject({
        attributeValueId: colours.striped,
        colour: 'в полоску',
      });
    });

    it('replaces an occupied slot and answers the replaced item', async () => {
      const who = await signIn(testApp.app);
      const old = await inSlot('top', { price: 1000, colourIds: [colours.red] });
      const next = await inSlot('top', { price: 2000 });
      await put(who, 'top', { productId: old.id, attributeValueId: colours.red }).expect(200);

      const response = await put(who, 'top', { productId: next.id });

      expect(response.status).toBe(200);
      const body = response.body as Change;
      expect(body.replaced).toMatchObject({
        slot: 'top',
        product: { id: old.id },
        attributeValueId: colours.red,
        colour: 'Красный',
      });
      expect(body.room.items).toHaveLength(1);
      expect(body.room.items[0]).toMatchObject({
        product: { id: next.id },
        attributeValueId: null,
        colour: null,
      });
      expect(body.room.sum).toBe(2000);
      expect(await rowsOf(who.userId)).toHaveLength(1);
    });

    it('a repeat of the same product and colour answers 200 with replaced null (A86.1)', async () => {
      const who = await signIn(testApp.app);
      const top = await inSlot('top', { colourIds: [colours.red] });
      await put(who, 'top', { productId: top.id, attributeValueId: colours.red }).expect(200);
      const before = await room(who);

      const response = await put(who, 'top', { productId: top.id, attributeValueId: colours.red });

      expect(response.status).toBe(200);
      const body = response.body as Change;
      expect(body.replaced).toBeNull();
      expect(body.room).toEqual(before);
      expect(await rowsOf(who.userId)).toHaveLength(1);
    });

    it('a repeat of the same product with no colour answers replaced null (A86.1)', async () => {
      const who = await signIn(testApp.app);
      const top = await inSlot('top');
      await put(who, 'top', { productId: top.id }).expect(200);
      const before = await room(who);

      const response = await put(who, 'top', { productId: top.id });

      expect(response.status).toBe(200);
      const body = response.body as Change;
      expect(body.replaced).toBeNull();
      expect(body.room).toEqual(before);
      expect(body.room.count).toBe(1);
      expect(await rowsOf(who.userId)).toHaveLength(1);
    });

    it('changes only the colour of the same product', async () => {
      const who = await signIn(testApp.app);
      const top = await inSlot('top', { colourIds: [colours.red, colours.blue] });
      await put(who, 'top', { productId: top.id, attributeValueId: colours.red }).expect(200);

      const response = await put(who, 'top', { productId: top.id, attributeValueId: colours.blue });

      expect(response.status).toBe(200);
      const body = response.body as Change;
      expect(body.replaced).toMatchObject({ colour: 'Красный' });
      expect(body.room.items[0]).toMatchObject({ product: { id: top.id }, colour: 'Синий' });
    });

    it('concurrent PUTs of different products to one slot all succeed and leave one row', async () => {
      const who = await signIn(testApp.app);
      const products = [await inSlot('top'), await inSlot('top'), await inSlot('top')];

      const responses = await Promise.all(
        products.map((top) => put(who, 'top', { productId: top.id })),
      );

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
      const rows = await rowsOf(who.userId);
      expect(rows).toHaveLength(1);
      expect(products.map((top) => top.id)).toContain(rows[0]?.productId);
      expect((await room(who)).count).toBe(1);
    });

    describe('refusals', () => {
      async function expectRefused(
        who: SignedIn,
        slot: string,
        body: object,
        code: string,
        detail: Detail,
      ) {
        const before = await rowsOf(who.userId);

        const response = await put(who, slot, body);

        expect(response.status).toBe(400);
        expect(errorOf(response).code).toBe(code);
        expect(errorOf(response).details).toContainEqual(expect.objectContaining(detail));
        expect(await rowsOf(who.userId)).toEqual(before);
        expect(await room(who)).toEqual(await roomBefore.get(who.userId));
      }
      const roomBefore = new Map<string, Room>();

      async function arranged() {
        const who = await signIn(testApp.app);
        const kept = await inSlot('top');
        await put(who, 'top', { productId: kept.id }).expect(200);
        roomBefore.set(who.userId, await room(who));
        return who;
      }

      it('an unknown product: RELATED_NOT_FOUND on productId', async () => {
        await expectRefused(
          await arranged(),
          'top',
          { productId: randomUUID() },
          'RELATED_NOT_FOUND',
          { field: 'productId', code: 'RELATED_NOT_FOUND' },
        );
      });

      it('a product of an inactive category: RELATED_NOT_FOUND on productId', async () => {
        const inactive = await testApp.prisma.category.create({
          data: {
            name: `Room off ${randomUUID()}`,
            slug: `room-off-${randomUUID()}`,
            isActive: false,
            slot: 'top',
          },
        });
        const hidden = await product(inactive.id);

        await expectRefused(
          await arranged(),
          'top',
          { productId: hidden.id },
          'RELATED_NOT_FOUND',
          { field: 'productId', code: 'RELATED_NOT_FOUND' },
        );
      });

      it('a colour that is not of the product: RELATED_NOT_FOUND on attributeValueId', async () => {
        const top = await inSlot('top', { colourIds: [colours.red] });

        await expectRefused(
          await arranged(),
          'top',
          { productId: top.id, attributeValueId: colours.blue },
          'RELATED_NOT_FOUND',
          { field: 'attributeValueId', code: 'RELATED_NOT_FOUND' },
        );
      });

      it('a value of the product that is not a colour (A76): RELATED_NOT_FOUND, nothing written', async () => {
        const top = await inSlot('top', { colourIds: [colours.red, colours.season] });
        const who = await arranged();

        const response = await put(who, 'top', {
          productId: top.id,
          attributeValueId: colours.season,
        });

        expect(response.status).toBe(400);
        expect(errorOf(response).code).toBe('RELATED_NOT_FOUND');
        expect(errorOf(response).details).toContainEqual(
          expect.objectContaining({
            field: 'attributeValueId',
            code: 'RELATED_NOT_FOUND',
            message: 'attributeValueId is not a colour of the product',
          }),
        );
        expect(await room(who)).toEqual(roomBefore.get(who.userId));
        expect(await rowsOf(who.userId)).toHaveLength(1);
      });

      it('a category without a slot: VALIDATION_FAILED with HAS_SLOT', async () => {
        const plain = await product(noSlotCategoryId);

        await expectRefused(await arranged(), 'top', { productId: plain.id }, 'VALIDATION_FAILED', {
          field: 'productId',
          code: 'HAS_SLOT',
        });
      });

      it('a product of another slot: VALIDATION_FAILED with MATCHES_SLOT', async () => {
        const jeans = await inSlot('bottom');

        await expectRefused(await arranged(), 'top', { productId: jeans.id }, 'VALIDATION_FAILED', {
          field: 'productId',
          code: 'MATCHES_SLOT',
        });
      });

      it('the accessory slot takes no product: MATCHES_SLOT', async () => {
        const top = await inSlot('top');

        await expectRefused(
          await arranged(),
          'accessory',
          { productId: top.id },
          'VALIDATION_FAILED',
          { field: 'productId', code: 'MATCHES_SLOT' },
        );
      });

      it('a slot that does not exist: VALIDATION_FAILED on slot', async () => {
        const top = await inSlot('top');

        await expectRefused(await arranged(), 'hat', { productId: top.id }, 'VALIDATION_FAILED', {
          field: 'slot',
          code: 'IS_ENUM',
        });
      });

      it('a productId that is not a uuid: VALIDATION_FAILED on productId', async () => {
        await expectRefused(await arranged(), 'top', { productId: 'nope' }, 'VALIDATION_FAILED', {
          field: 'productId',
          code: 'IS_UUID',
        });
      });

      it('an attributeValueId that is not a uuid: VALIDATION_FAILED', async () => {
        const top = await inSlot('top');

        await expectRefused(
          await arranged(),
          'top',
          { productId: top.id, attributeValueId: 'nope' },
          'VALIDATION_FAILED',
          { field: 'attributeValueId', code: 'IS_UUID' },
        );
      });

      it('an attributeValueId of null: VALIDATION_FAILED, not a database error', async () => {
        const top = await inSlot('top');

        await expectRefused(
          await arranged(),
          'top',
          { productId: top.id, attributeValueId: null },
          'VALIDATION_FAILED',
          { field: 'attributeValueId', code: 'IS_UUID' },
        );
      });

      it('an unknown body field: VALIDATION_FAILED', async () => {
        const top = await inSlot('top');

        const who = await arranged();
        const response = await put(who, 'top', { productId: top.id, userId: randomUUID() });

        expect(response.status).toBe(400);
        expect(errorOf(response).code).toBe('VALIDATION_FAILED');
        expect(errorOf(response).details.map((detail) => detail.field)).toContain('userId');
        expect(await room(who)).toEqual(roomBefore.get(who.userId));
      });
    });
  });

  describe('DELETE', () => {
    it('answers 401 signed out', async () => {
      expect((await http().delete('/me/fitting-room/top')).status).toBe(401);
      expect((await http().delete('/me/fitting-room')).status).toBe(401);
    });

    it('DELETE /:slot empties the slot and keeps the others', async () => {
      const who = await signIn(testApp.app);
      await put(who, 'top', { productId: (await inSlot('top')).id }).expect(200);
      await put(who, 'bottom', { productId: (await inSlot('bottom')).id }).expect(200);

      const response = await http().delete('/me/fitting-room/top').set(as(who));

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect((await room(who)).items.map((item) => item.slot)).toEqual(['bottom']);
    });

    it('DELETE /:slot on an empty slot answers 204 too', async () => {
      const who = await signIn(testApp.app);

      await http().delete('/me/fitting-room/shoes').set(as(who)).expect(204);
      await http().delete('/me/fitting-room/accessory').set(as(who)).expect(204);
    });

    it('DELETE /:slot refuses a slot that does not exist', async () => {
      const who = await signIn(testApp.app);

      const response = await http().delete('/me/fitting-room/hat').set(as(who));

      expect(response.status).toBe(400);
      expect(errorOf(response).details.map((detail) => detail.field)).toContain('slot');
    });

    it('DELETE clears the whole room', async () => {
      const who = await signIn(testApp.app);
      await put(who, 'top', { productId: (await inSlot('top')).id }).expect(200);
      await put(who, 'shoes', { productId: (await inSlot('shoes')).id }).expect(200);

      const response = await http().delete('/me/fitting-room').set(as(who));

      expect(response.status).toBe(204);
      expect(await room(who)).toEqual({ items: [], count: 0, sum: 0 });
      expect(await rowsOf(who.userId)).toEqual([]);
    });
  });

  describe("someone else's room", () => {
    it('is not seen, deleted or changed by another user', async () => {
      const [a, b] = [await signIn(testApp.app), await signIn(testApp.app)];
      const mine = await inSlot('top');
      const theirs = await inSlot('top');
      await put(a, 'top', { productId: mine.id }).expect(200);
      const before = await room(a);

      expect(await room(b)).toEqual({ items: [], count: 0, sum: 0 });
      await http().delete('/me/fitting-room/top').set(as(b)).expect(204);
      await http().delete('/me/fitting-room').set(as(b)).expect(204);
      const change = (await put(b, 'top', { productId: theirs.id }).expect(200)).body as Change;

      expect(change.replaced).toBeNull();
      expect(change.room.items.map((item) => item.product.id)).toEqual([theirs.id]);
      expect(await room(a)).toEqual(before);
      expect(await rowsOf(a.userId)).toHaveLength(1);
    });
  });

  describe('a row the room no longer shows (A86.7)', () => {
    it('stays in the table, is left out of the room, and a PUT replaces it with replaced null', async () => {
      const who = await signIn(testApp.app);
      const category = await testApp.prisma.category.create({
        data: {
          name: `Room fade ${randomUUID()}`,
          slug: `room-fade-${randomUUID()}`,
          isActive: true,
          slot: 'top',
        },
      });
      const fading = await product(category.id, { price: 700 });
      const other = await inSlot('bottom', { price: 300 });
      await put(who, 'top', { productId: fading.id }).expect(200);
      await put(who, 'bottom', { productId: other.id }).expect(200);

      await testApp.prisma.category.update({
        where: { id: category.id },
        data: { isActive: false },
      });

      expect(await rowsOf(who.userId)).toHaveLength(2);
      const hidden = await room(who);
      expect(hidden.items.map((item) => item.slot)).toEqual(['bottom']);
      expect(hidden.count).toBe(1);
      expect(hidden.sum).toBe(300);

      await testApp.prisma.category.update({
        where: { id: category.id },
        data: { isActive: true, slot: 'shoes' },
      });
      expect((await room(who)).items.map((item) => item.slot)).toEqual(['bottom']);

      const next = await inSlot('top');
      const change = (await put(who, 'top', { productId: next.id }).expect(200)).body as Change;
      expect(change.replaced).toBeNull();
      expect(change.room.items.map((item) => item.slot)).toEqual(['top', 'bottom']);
      expect(await rowsOf(who.userId)).toHaveLength(2);
    });
  });

  describe('the database keys', () => {
    it('removing the product colour link sets attributeValueId to null and keeps the row', async () => {
      const who = await signIn(testApp.app);
      const top = await inSlot('top', { colourIds: [colours.red, colours.blue] });
      await put(who, 'top', { productId: top.id, attributeValueId: colours.red }).expect(200);

      await testApp.prisma.productAttributeValue.delete({
        where: {
          productId_attributeValueId: { productId: top.id, attributeValueId: colours.red },
        },
      });

      const rows = await rowsOf(who.userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ productId: top.id, attributeValueId: null });
      expect((await room(who)).items[0]).toMatchObject({ attributeValueId: null, colour: null });
    });

    it('deleting the product deletes the row', async () => {
      const who = await signIn(testApp.app);
      const top = await inSlot('top');
      await put(who, 'top', { productId: top.id }).expect(200);

      await testApp.prisma.product.delete({ where: { id: top.id } });

      expect(await rowsOf(who.userId)).toEqual([]);
      expect(await room(who)).toEqual({ items: [], count: 0, sum: 0 });
    });
  });

  describe('a deleted user with a cached session copy (N31)', () => {
    async function gone() {
      const who = await signIn(testApp.app);
      const top = await inSlot('top');
      await put(who, 'top', { productId: top.id }).expect(200);
      const read = await http().get('/api/auth/get-session').set(as(who)).expect(200);
      const setCookie = read.headers['set-cookie'] as unknown as string[];
      const cookies = setCookie.map((line) => line.split(';')[0]);
      const data = cookies.find((pair) => pair?.startsWith(`${sessionData}=`));
      expect(data).toBeTruthy();
      const copy = { Cookie: `${who.cookie}; ${data}` };
      await testApp.prisma.user.delete({ where: { id: who.userId } });
      return { copy, productId: top.id };
    }

    function expectExpired(response: request.Response) {
      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('UNAUTHORIZED');
      const headers = (response.headers['set-cookie'] as string[] | undefined) ?? [];
      for (const name of cookieNames) {
        const header = headers.find((line) => line.startsWith(`${name}=;`));
        expect(header, name).toBeDefined();
        expect(header).toMatch(/Expires=Thu, 01 Jan 1970/);
      }
    }

    it('answers 401 with the cookies expired on PUT', async () => {
      const { copy, productId } = await gone();

      expectExpired(await http().put('/me/fitting-room/top').set(copy).send({ productId }));
    });

    it('answers 401 with the cookies expired on DELETE /:slot', async () => {
      const { copy } = await gone();

      expectExpired(await http().delete('/me/fitting-room/top').set(copy));
    });

    it('answers 401 with the cookies expired on DELETE', async () => {
      const { copy } = await gone();

      expectExpired(await http().delete('/me/fitting-room').set(copy));
    });

    it('answers an empty room on GET', async () => {
      const { copy } = await gone();

      const response = await http().get('/me/fitting-room').set(copy);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [], count: 0, sum: 0 });
    });
  });

  describe('DELETE /me (AC28)', () => {
    it('leaves no fitting room row of the user and keeps another user’s', async () => {
      const [who, bystander] = [await signIn(testApp.app), await signIn(testApp.app)];
      const items = [await inSlot('top'), await inSlot('shoes')];
      await put(who, 'top', { productId: items[0]?.id }).expect(200);
      await put(who, 'shoes', { productId: items[1]?.id }).expect(200);
      await put(bystander, 'top', { productId: items[0]?.id }).expect(200);
      expect(await rowsOf(who.userId)).toHaveLength(2);

      await http().delete('/me').set(as(who)).expect(204);

      expect(await rowsOf(who.userId)).toEqual([]);
      expect(await rowsOf(bystander.userId)).toHaveLength(1);
    });
  });
});
