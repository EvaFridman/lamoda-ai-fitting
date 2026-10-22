import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppException } from '../../common/errors/app.exception.js';
import { readPhotoUpload } from './photo-upload.js';

const MAX = 1000;

interface Answer {
  status: number;
  error?: {
    code: string;
    message: string;
    details: { field: string; code: string; message: string }[];
  };
  photo?: string;
  save?: boolean;
}

describe('readPhotoUpload', () => {
  let server: Server;

  beforeAll(() => {
    server = createServer((req, res) => {
      void readPhotoUpload(req, MAX).then(
        ({ photo, save }) => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ photo: photo.toString('latin1'), save }));
        },
        (error: unknown) => {
          const isApp = error instanceof AppException;
          res.statusCode = isApp ? error.getStatus() : 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(isApp ? error.body : { error: { code: 'INTERNAL' } }));
        },
      );
    });
    return new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const post = () => request(server).post('/');
  const file = (bytes: Buffer | string = 'PIXELS') => ({
    filename: 'a.jpg',
    contentType: 'image/jpeg',
    bytes: Buffer.from(bytes),
  });

  function upload(parts: {
    photo?: Buffer | string;
    save?: string;
    extra?: Record<string, string>;
  }) {
    const req = post();
    if (parts.photo !== undefined) {
      const f = file(parts.photo);
      req.attach('photo', f.bytes, { filename: f.filename, contentType: f.contentType });
    }
    if (parts.save !== undefined) req.field('save', parts.save);
    for (const [name, value] of Object.entries(parts.extra ?? {})) req.field(name, value);
    return req;
  }

  async function answer(req: request.Test): Promise<Answer> {
    const response = await req;
    return { status: response.status, ...(response.body as object) };
  }

  it('reads the photo and defaults save to true', async () => {
    const result = await answer(upload({ photo: 'PIXELS' }));

    expect(result).toMatchObject({ status: 200, photo: 'PIXELS', save: true });
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('reads save=%s', async (value, expected) => {
    const result = await answer(upload({ photo: 'PIXELS', save: value }));

    expect(result).toMatchObject({ status: 200, save: expected });
  });

  it.each(['yes', '1', 'TRUE', 'truefalse', ''])(
    'refuses save=%j with IS_BOOLEAN',
    async (value) => {
      const result = await answer(upload({ photo: 'PIXELS', save: value }));

      expect(result.status).toBe(400);
      expect(result.error?.code).toBe('VALIDATION_FAILED');
      expect(result.error?.details).toContainEqual(
        expect.objectContaining({ field: 'save', code: 'IS_BOOLEAN' }),
      );
    },
  );

  it('refuses a body that is not multipart with the IS_IMAGE detail', async () => {
    const result = await answer(post().send({ photo: 'x' }));

    expect(result.status).toBe(400);
    expect(result.error?.code).toBe('VALIDATION_FAILED');
    expect(result.error?.details).toEqual([
      expect.objectContaining({ field: 'photo', code: 'IS_IMAGE' }),
    ]);
  });

  it('refuses a body with no content type', async () => {
    const result = await answer(post().set('Content-Type', '').send('abc'));

    expect(result.status).toBe(400);
    expect(result.error?.details[0]).toMatchObject({ field: 'photo', code: 'IS_IMAGE' });
  });

  it('refuses a form without the photo part with IS_IMAGE', async () => {
    const result = await answer(upload({ save: 'true' }));

    expect(result.status).toBe(400);
    expect(result.error?.details).toEqual([
      expect.objectContaining({ field: 'photo', code: 'IS_IMAGE' }),
    ]);
  });

  it('refuses a photo sent as a text field instead of a file', async () => {
    const result = await answer(upload({ extra: { photo: 'text' } }));

    expect(result.status).toBe(400);
    const codes = result.error?.details.map((detail) => detail.code);
    expect(codes).toContain('IS_IMAGE');
  });

  it('refuses a text field it does not know with WHITELIST_VALIDATION', async () => {
    const result = await answer(upload({ photo: 'PIXELS', extra: { userId: 'other' } }));

    expect(result.status).toBe(400);
    expect(result.error?.details).toContainEqual(
      expect.objectContaining({ field: 'userId', code: 'WHITELIST_VALIDATION' }),
    );
  });

  it('refuses a file under another name with WHITELIST_VALIDATION', async () => {
    const result = await answer(
      post()
        .attach('photo', Buffer.from('PIXELS'), { filename: 'a.jpg' })
        .attach('other', Buffer.from('X'), { filename: 'b.jpg' }),
    );

    expect(result.status).toBe(400);
    expect(result.error?.details).toContainEqual(
      expect.objectContaining({ field: 'other', code: 'WHITELIST_VALIDATION' }),
    );
  });

  it('refuses a second file in photo', async () => {
    const result = await answer(
      post()
        .attach('photo', Buffer.from('ONE'), { filename: 'a.jpg' })
        .attach('photo', Buffer.from('TWO'), { filename: 'b.jpg' }),
    );

    expect(result.status).toBe(400);
    expect(result.error?.details).toContainEqual(
      expect.objectContaining({ field: 'photo', code: 'WHITELIST_VALIDATION' }),
    );
  });

  it('answers 413 PAYLOAD_TOO_LARGE for a file over the limit', async () => {
    const result = await answer(upload({ photo: Buffer.alloc(MAX + 1, 1) }));

    expect(result.status).toBe(413);
    expect(result.error?.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('accepts a file of exactly the limit', async () => {
    const result = await answer(upload({ photo: Buffer.alloc(MAX, 1) }));

    expect(result.status).toBe(200);
    expect(result.photo).toHaveLength(MAX);
  });

  it('answers 413 before reading when Content-Length is over the limit plus 16 KiB', async () => {
    const { port } = server.address() as AddressInfo;
    // The body is announced and never sent: only an answer given before reading it comes back.
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          port,
          host: '127.0.0.1',
          method: 'POST',
          headers: {
            'Content-Type': 'multipart/form-data; boundary=x',
            'Content-Length': String(MAX + 16 * 1024 + 1),
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
          req.destroy();
        },
      );
      req.on('error', (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(error);
      });
      req.flushHeaders();
    });

    expect(status).toBe(413);
  });

  it('answers 400 "The body cannot be read" for multipart with no boundary', async () => {
    const result = await answer(
      post().set('Content-Type', 'multipart/form-data').send('--x\r\n\r\nabc'),
    );

    expect(result.status).toBe(400);
    expect(result.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'The body cannot be read',
    });
  });

  it.each(['other', 'photo'])(
    'answers 400 "The body cannot be read" for a body that ends inside a part named %s after a whole photo',
    async (name) => {
      const result = await answer(
        post()
          .set('Content-Type', 'multipart/form-data; boundary=xyz')
          .send(
            '--xyz\r\nContent-Disposition: form-data; name="photo"; filename="a.jpg"\r\n\r\nABC\r\n' +
              `--xyz\r\nContent-Disposition: form-data; name="${name}"; filename="b.jpg"\r\n\r\nDEF`,
          ),
      );

      expect(result.status).toBe(400);
      expect(result.error?.message).toBe('The body cannot be read');
    },
  );

  it('clips a part name of 300 characters in the detail', async () => {
    const name = 'n'.repeat(300);

    const result = await answer(upload({ photo: 'PIXELS', extra: { [name]: 'x' } }));

    expect(result.status).toBe(400);
    const detail = result.error?.details.find((d) => d.code === 'WHITELIST_VALIDATION');
    expect(detail?.field).toHaveLength(100);
    expect(detail?.field.endsWith('…')).toBe(true);
    expect(detail?.message.length).toBeLessThanOrEqual(200);
  });

  it('clips the name of an unknown file part too', async () => {
    const name = 'f'.repeat(300);

    const result = await answer(
      post()
        .attach('photo', Buffer.from('PIXELS'), { filename: 'a.jpg' })
        .attach(name, Buffer.from('X'), { filename: 'b.jpg' }),
    );

    const detail = result.error?.details.find((d) => d.code === 'WHITELIST_VALIDATION');
    expect(detail?.field).toHaveLength(100);
    expect(detail?.message.length).toBeLessThanOrEqual(200);
  });

  it('answers 400 "The body cannot be read" for a body that ends inside a part', async () => {
    const result = await answer(
      post()
        .set('Content-Type', 'multipart/form-data; boundary=xyz')
        .send('--xyz\r\nContent-Disposition: form-data; name="photo"; filename="a.jpg"\r\n\r\nABC'),
    );

    expect(result.status).toBe(400);
    expect(result.error?.message).toBe('The body cannot be read');
  });
});
