import { S3ServiceException } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { StorageError } from './storage.error.js';

function s3Error(fields: {
  name: string;
  status?: number;
  requestId?: string;
}): S3ServiceException {
  const error = new S3ServiceException({
    name: fields.name,
    $fault: 'client',
    $metadata: { httpStatusCode: fields.status, requestId: fields.requestId },
    message: 'The key keep/users/u1/photos/a.webp does not exist',
  });
  Object.assign(error, {
    $response: { body: 'authorization: Credential=AKID' },
    Key: 'keep/users/u1/photos/a.webp',
    Resource: '/bucket/keep/users/u1',
  });
  return error;
}

describe('StorageError.from', () => {
  it('keeps the operation, code, status and request id of an S3 error', () => {
    const error = StorageError.from(
      'HeadObject',
      s3Error({ name: 'NoSuchKey', status: 404, requestId: '18DF077E194C5A5E' }),
    );

    expect(error).toBeInstanceOf(StorageError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('StorageError');
    expect(error.operation).toBe('HeadObject');
    expect(error.code).toBe('NoSuchKey');
    expect(error.status).toBe(404);
    expect(error.requestId).toBe('18DF077E194C5A5E');
    expect(error.message).toBe('Storage HeadObject failed: NoSuchKey (HTTP 404)');
  });

  it('carries no cause, no response and none of the answer fields', () => {
    const error = StorageError.from(
      'HeadObject',
      s3Error({ name: 'NoSuchKey', status: 404, requestId: 'r1' }),
    );

    expect(error.cause).toBeUndefined();
    expect(Object.getOwnPropertyNames(error).sort()).toEqual(
      ['code', 'message', 'name', 'operation', 'requestId', 'stack', 'status'].sort(),
    );
    const text = [error.message, error.stack, JSON.stringify(error)].join('\n');
    expect(text).not.toContain('keep/users');
    expect(text).not.toContain('AKID');
  });

  it('turns a value that is not an Error into Unknown', () => {
    const error = StorageError.from('PutObject', 'keep/users/u1 failed');

    expect(error.code).toBe('Unknown');
    expect(error.status).toBeUndefined();
    expect(error.requestId).toBeUndefined();
    expect(error.message).toBe('Storage PutObject failed: Unknown');
  });

  it.each(['has spaces', 'keep/users/u1', 'a'.repeat(65), '', 'name: <Error>'])(
    'turns the odd error name %j into Unknown',
    (name) => {
      expect(StorageError.from('PutObject', s3Error({ name, status: 500 })).code).toBe('Unknown');
    },
  );

  it.each(['has spaces', 'x'.repeat(129), '', 'a<b>', 'keep users'])(
    'drops the odd request id %j',
    (requestId) => {
      expect(
        StorageError.from('PutObject', s3Error({ name: 'Boom', status: 500, requestId })).requestId,
      ).toBeUndefined();
    },
  );

  it('leaves the status out of the message when there is none', () => {
    const error = StorageError.from(
      'ListObjectsV2',
      Object.assign(new Error('x'), { name: 'ECONNRESET' }),
    );

    expect(error.status).toBeUndefined();
    expect(error.code).toBe('ECONNRESET');
    expect(error.message).toBe('Storage ListObjectsV2 failed: ECONNRESET');
  });

  it('takes the string code of a network error before its name', () => {
    const error = StorageError.from(
      'PutObject',
      Object.assign(new Error('connect keep/users/u1'), { code: 'ECONNREFUSED' }),
    );

    expect(error.code).toBe('ECONNREFUSED');
    expect(error.message).toBe('Storage PutObject failed: ECONNREFUSED');
  });

  it('turns a code that is not name-like into Unknown, even if the name is fine', () => {
    const error = StorageError.from(
      'PutObject',
      Object.assign(new Error('x'), { name: 'NoSuchKey', code: 'bad code/x' }),
    );

    expect(error.code).toBe('Unknown');
  });

  it('falls back to the name when the code is not a string', () => {
    const error = StorageError.from(
      'PutObject',
      Object.assign(new Error('x'), { name: 'TimeoutError', code: 110 }),
    );

    expect(error.code).toBe('TimeoutError');
  });

  it('ignores a status that is not a number', () => {
    const source = Object.assign(new Error('x'), { $metadata: { httpStatusCode: '404' } });

    expect(StorageError.from('HeadObject', source).status).toBeUndefined();
  });
});
