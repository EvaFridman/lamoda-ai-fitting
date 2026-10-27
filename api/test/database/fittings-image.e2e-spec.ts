import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { generationResultKey } from '../../src/storage/keys.js';
import { StorageError } from '../../src/storage/storage.error.js';
import { StorageService } from '../../src/storage/storage.service.js';
import { signIn, type SignedIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

interface ErrorBody {
  error: { code: string; message: string };
}

// Room for the handler to read a large result from the emulator under load (Docker of two stacks,
// CI), so the slow read below fails only on the writing, which is what it checks.
const TIMEOUT_MS = 3_000;

let testApp: TestApp;
let storage: StorageService;

beforeAll(async () => {
  vi.stubEnv('REQUEST_TIMEOUT_MS', String(TIMEOUT_MS));
  // Their sum must stay under the request timeout, and the text check at most half of it (env.ts).
  vi.stubEnv('DATABASE_STATEMENT_TIMEOUT_MS', '1000');
  vi.stubEnv('DATABASE_CONNECTION_TIMEOUT_MS', '1000');
  vi.stubEnv('FITTING_CHECK_TIMEOUT_MS', '1500');
  testApp = await createTestApp({ access: 'production' });
  storage = testApp.app.get(StorageService);
}, 120_000);

afterAll(async () => {
  await testApp.close();
  vi.unstubAllEnvs();
});

async function newOwner() {
  const user = await signIn(testApp.app);
  const session = await testApp.prisma.fittingSession.create({ data: { userId: user.userId } });
  return { user, sessionId: session.id };
}

interface FittingOptions {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  kind?: 'single' | 'look' | null;
  resultImageKey?: string | null;
  finishedAt?: Date | null;
  parentId?: string;
}

async function newFitting(
  owner: { user: SignedIn; sessionId: string },
  options: FittingOptions = {},
) {
  const status = options.status ?? 'completed';
  const id = randomUUID();
  const key =
    options.resultImageKey === undefined
      ? status === 'completed'
        ? generationResultKey(owner.user.userId, id)
        : null
      : options.resultImageKey;
  await testApp.prisma.aiGeneration.create({
    data: {
      id,
      sessionId: owner.sessionId,
      userId: owner.user.userId,
      userImageKey: `keep/users/${owner.user.userId}/generations/${id}/input.webp`,
      status,
      resultImageKey: key,
      errorMessage: status === 'failed' ? 'provider timeout' : null,
      aiProvider: 'test-provider',
      aiModel: 'test-model',
      kind: options.kind === undefined ? 'single' : options.kind,
      finishedAt:
        options.finishedAt === undefined
          ? status === 'completed'
            ? new Date('2026-10-27T21:05:00Z')
            : null
          : options.finishedAt,
      ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
    },
  });
  return { id, key };
}

async function putResult(owner: { user: SignedIn }, key: string, bytes: Uint8Array) {
  await storage.put(key, bytes, { contentType: 'image/webp', ownerUserId: owner.user.userId });
}

const get = (id: string, user?: SignedIn) => {
  const call = request(testApp.app.getHttpServer()).get(`/fittings/${id}/image`);
  return user === undefined ? call : call.set('Cookie', user.cookie);
};

describe('GET /fittings/:id/image (spec 0023 plan §3.2, Y8)', () => {
  it('answers the result bytes exactly as an attachment named by the Moscow time', async () => {
    const owner = await newOwner();
    const { id, key } = await newFitting(owner);
    const bytes = randomBytes(5_000);
    await putResult(owner, key ?? '', bytes);

    const response = await get(id, owner.user)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(Buffer.compare(response.body as Buffer, Buffer.from(bytes))).toBe(0);
    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.headers['content-length']).toBe(String(bytes.byteLength));
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="primerka-2026-10-28-0005.webp"',
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('answers a look and a regeneration too', async () => {
    const owner = await newOwner();
    const look = await newFitting(owner, { kind: 'look' });
    const regeneration = await newFitting(owner, { kind: 'look', parentId: look.id });
    await putResult(owner, look.key ?? '', randomBytes(100));
    await putResult(owner, regeneration.key ?? '', randomBytes(100));

    await get(look.id, owner.user).expect(200);
    await get(regeneration.id, owner.user).expect(200);
  });

  it('names the file by the start when the row has no finish time', async () => {
    const owner = await newOwner();
    const { id, key } = await newFitting(owner, { finishedAt: null });
    await putResult(owner, key ?? '', randomBytes(100));

    const response = await get(id, owner.user).expect(200);

    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="primerka-\d{4}-\d{2}-\d{2}-\d{4}\.webp"$/,
    );
  });

  it('answers 401 to a visitor who is signed out', async () => {
    const owner = await newOwner();
    const { id, key } = await newFitting(owner);
    await putResult(owner, key ?? '', randomBytes(100));

    const response = await get(id).expect(401);

    expect((response.body as ErrorBody).error.code).toBe('UNAUTHORIZED');
  });

  it('answers 400 for an id that is not a uuid', async () => {
    const owner = await newOwner();

    const response = await get('not-a-uuid', owner.user).expect(400);

    expect((response.body as ErrorBody).error.code).toBe('INVALID_ID');
  });

  it("answers 404 for someone else's fitting", async () => {
    const owner = await newOwner();
    const stranger = await newOwner();
    const { id, key } = await newFitting(owner);
    await putResult(owner, key ?? '', randomBytes(100));

    const response = await get(id, stranger.user).expect(404);

    expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('answers 404 for an id that names no fitting', async () => {
    const owner = await newOwner();

    const response = await get(randomUUID(), owner.user).expect(404);

    expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND');
  });

  it.each(['pending', 'processing', 'failed'] as const)(
    'answers 404 for a %s fitting',
    async (status) => {
      const owner = await newOwner();
      const { id } = await newFitting(owner, { status });

      const response = await get(id, owner.user).expect(404);

      expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND');
    },
  );

  it('answers 404 for a row with no kind (the closed route’s rows)', async () => {
    const owner = await newOwner();
    const { id, key } = await newFitting(owner, { kind: null });
    await putResult(owner, key ?? '', randomBytes(100));

    const response = await get(id, owner.user).expect(404);

    expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND');
  });

  it("answers 404 for a key outside the owner's folder, without reading it", async () => {
    const owner = await newOwner();
    const other = await newOwner();
    const foreignKey = generationResultKey(other.user.userId, randomUUID());
    await putResult(other, foreignKey, randomBytes(100));
    const { id } = await newFitting(owner, { resultImageKey: foreignKey });

    const response = await get(id, owner.user).expect(404);

    expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('answers 404 when the bucket has no such object', async () => {
    const owner = await newOwner();
    const { id } = await newFitting(owner);

    const response = await get(id, owner.user).expect(404);

    expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('answers 503 SERVICE_UNAVAILABLE in the error format when the storage fails', async () => {
    const owner = await newOwner();
    const { id, key } = await newFitting(owner);
    await putResult(owner, key ?? '', randomBytes(100));
    const spy = vi
      .spyOn(storage, 'get')
      .mockRejectedValueOnce(new StorageError('GetObject', 'InternalError', 500, undefined));

    try {
      const response = await get(id, owner.user).expect(503);

      expect(response.body).toEqual({
        error: { code: 'SERVICE_UNAVAILABLE', message: expect.any(String), details: [] },
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('delivers the whole file to a client that starts reading after the request timeout', async () => {
    const owner = await newOwner();
    const { id, key } = await newFitting(owner);
    // Far more than the socket buffers on both sides can hold.
    const bytes = Buffer.concat(Array.from({ length: 12 }, () => randomBytes(1024 * 1024)));
    await putResult(owner, key ?? '', bytes);
    await testApp.app.listen(0, '127.0.0.1');
    const { port } = testApp.app.getHttpServer().address() as AddressInfo;

    const received = await new Promise<{ status: number | undefined; body: Buffer }>(
      (resolve, reject) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port,
            path: `/fittings/${id}/image`,
            headers: { cookie: owner.user.cookie },
          },
          (res) => {
            res.pause();
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
            // Reading starts only after the request timeout has passed.
            setTimeout(() => res.resume(), TIMEOUT_MS * 2);
          },
        );
        req.on('error', reject);
        req.end();
      },
    );

    expect(received.status).toBe(200);
    expect(received.body.byteLength).toBe(bytes.byteLength);
    expect(Buffer.compare(received.body, bytes)).toBe(0);
  }, 60_000);
});
