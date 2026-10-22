import type { IncomingMessage } from 'node:http';

import busboy from 'busboy';

import {
  AppException,
  type ErrorDetail,
  ValidationError,
} from '../../common/errors/app.exception.js';
import {
  clip,
  MAX_FIELD_LENGTH,
  MAX_MESSAGE_LENGTH,
} from '../../common/validation/validation-pipe.js';

// The multipart body of `POST /me/photos` (spec 0019 plan §5), read by busboy on this route only:
// the api's own parsers stay off (spec 0006 F26), so nothing else reads a form body. One file
// field `photo` and an optional `save` (`true` by default; `false` marks the photo one-time, A24).
// Any other part is an unknown field, as the DTOs' whitelist answers (WHITELIST_VALIDATION).
export interface PhotoUpload {
  photo: Buffer;
  save: boolean;
}

export const PHOTO_FIELD = 'photo';
export const SAVE_FIELD = 'save';

// What a multipart body holds beyond the file: the boundary lines, the parts' headers and the
// `save` field. A Content-Length above the file limit and this is refused before a byte is read.
const MULTIPART_OVERHEAD = 16 * 1024;

// The detail of a missing photo or of a file that is not a JPG, PNG or WebP image (A31); the
// code's text is web's `DETAIL_TEXTS.IS_IMAGE`.
export function notAnImage(
  message = `${PHOTO_FIELD} must be a JPG, PNG or WebP image`,
): ErrorDetail {
  return { field: PHOTO_FIELD, code: 'IS_IMAGE', message };
}

// A part's name comes from the client (busboy reads up to 16 KB of part headers), so it is cut
// as the pipe cuts an unknown field's (spec 0006 F25).
function unknownField(name: string): ErrorDetail {
  return {
    field: clip(name, MAX_FIELD_LENGTH),
    code: 'WHITELIST_VALIDATION',
    message: clip(`property ${name} should not exist`, MAX_MESSAGE_LENGTH),
  };
}

function payloadTooLarge(): AppException {
  return new AppException('PAYLOAD_TOO_LARGE', 'The photo is too large');
}

// As body-parser's client errors are answered (common/filters/to-app-exception.ts).
function unreadable(): AppException {
  return new AppException('VALIDATION_FAILED', 'The body cannot be read');
}

// Reads the request's body. The file's bytes stay in memory (at most `maxBytes`, 413
// PAYLOAD_TOO_LARGE past it); a body that is not multipart answers 400 with the `photo` detail
// (AC4: the api's format whatever the body's type), as does one busboy cannot parse.
export function readPhotoUpload(req: IncomingMessage, maxBytes: number): Promise<PhotoUpload> {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return Promise.reject(
      new ValidationError([notAnImage(`${PHOTO_FIELD} must be sent as multipart/form-data`)]),
    );
  }
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > maxBytes + MULTIPART_OVERHEAD) {
    return Promise.reject(payloadTooLarge());
  }
  let parser: busboy.Busboy;
  try {
    parser = busboy({
      headers: req.headers,
      // The file is cut at the limit (`limit` below): busboy emits it when the bytes reach
      // `fileSize`, so one more lets a file of exactly maxBytes through. The small limits of the
      // rest keep a body of many parts from being read whole. `fieldSize`: `false` is 5 characters.
      limits: {
        files: 2,
        fileSize: maxBytes + 1,
        fields: 4,
        fieldSize: 8,
        parts: 6,
      },
    });
  } catch {
    // No boundary, or not a multipart type busboy knows.
    return Promise.reject(unreadable());
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const details: ErrorDetail[] = [];
    let fileSeen = false;
    let photo: Buffer | undefined;
    let save = true;
    let settled = false;
    // Once: the rest of the body is drained, so the answer goes out on a readable connection.
    const settle = (end: () => void): void => {
      if (settled) return;
      settled = true;
      req.unpipe(parser);
      req.resume();
      end();
    };
    const fail = (error: AppException): void => settle(() => reject(error));

    parser.on('file', (name, stream, _info) => {
      // A body that ends inside this part: busboy destroys the stream with an error, which would
      // be an uncaught exception (and the end of the process) without a listener, on an unknown
      // part as much as on the photo's.
      stream.on('error', () => fail(unreadable()));
      if (name !== PHOTO_FIELD || fileSeen) {
        details.push(unknownField(name));
        stream.resume();
        return;
      }
      fileSeen = true;
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.on('limit', () => fail(payloadTooLarge()));
      stream.on('end', () => {
        photo = Buffer.concat(chunks);
      });
    });
    parser.on('field', (name, value, info) => {
      if (name !== SAVE_FIELD) {
        details.push(unknownField(name));
        return;
      }
      if (info.valueTruncated || (value !== 'true' && value !== 'false')) {
        details.push({
          field: SAVE_FIELD,
          code: 'IS_BOOLEAN',
          message: `${SAVE_FIELD} must be true or false`,
        });
        return;
      }
      save = value === 'true';
    });
    const tooManyParts = (): void =>
      fail(
        new ValidationError([
          { field: '', code: 'WHITELIST_VALIDATION', message: 'The body has too many parts' },
        ]),
      );
    parser.on('filesLimit', tooManyParts);
    parser.on('fieldsLimit', tooManyParts);
    parser.on('partsLimit', tooManyParts);
    parser.on('error', () => fail(unreadable()));
    parser.on('close', () =>
      settle(() => {
        if (photo === undefined) details.push(notAnImage());
        if (details.length > 0 || photo === undefined) {
          reject(new ValidationError(details));
          return;
        }
        resolve({ photo, save });
      }),
    );
    req.on('error', () => fail(unreadable()));
    req.pipe(parser);
  });
}
