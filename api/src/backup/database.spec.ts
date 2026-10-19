import { EventEmitter } from 'node:events';
import { PassThrough, Readable, Writable } from 'node:stream';

import { generateIdentity, identityToRecipient } from 'age-encryption';
import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copyDatabase, gate, split, TOOL_LOG_LINE_MAX, toolLogLine } from './database.js';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

const CHUNK = Buffer.alloc(64 * 1024, 7);

function chunks(count: number): Buffer[] {
  return Array.from({ length: count }, () => CHUNK);
}

async function collect(stream: Readable): Promise<number> {
  let total = 0;
  for await (const chunk of stream) total += (chunk as Buffer).length;
  return total;
}

// Settles on the stream's first end or error; `ended` tells which.
function outcome(stream: Readable): Promise<{ ended: boolean; error?: Error }> {
  return new Promise((resolve) => {
    stream.on('data', () => undefined);
    stream.once('end', () => resolve({ ended: true }));
    stream.once('error', (error: Error) => resolve({ ended: false, error }));
  });
}

describe('gate', () => {
  it('lets the stream end with all data once the checks resolve', async () => {
    let release: () => void = () => undefined;
    const checks = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stream = gate(checks);
    let ended = false;
    stream.on('end', () => {
      ended = true;
    });
    const total = collect(stream);
    for (const chunk of chunks(3)) stream.write(chunk);
    stream.end();

    await new Promise((resolve) => setImmediate(resolve));
    expect(ended).toBe(false);

    release();
    expect(await total).toBe(3 * CHUNK.length);
    expect(ended).toBe(true);
  });

  it('destroys the stream with the error of a check and never ends it', async () => {
    let fail: (error: Error) => void = () => undefined;
    const checks = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    const stream = gate(checks);
    const result = outcome(stream);
    stream.end(CHUNK);
    await new Promise((resolve) => setImmediate(resolve));

    const reason = new Error('pg_restore exited with code 1');
    fail(reason);

    const { ended, error } = await result;
    expect(ended).toBe(false);
    expect(error).toBe(reason);
    expect(stream.destroyed).toBe(true);
  });

  it('destroys a stream whose source had already ended before the check failed', async () => {
    const reason = new Error('late failure');
    let fail: (error: Error) => void = () => undefined;
    const checks = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    const stream = gate(checks);
    const events: string[] = [];
    stream.on('end', () => events.push('end'));
    stream.on('error', () => events.push('error'));
    stream.resume();
    stream.end();
    await new Promise((resolve) => setImmediate(resolve));
    fail(reason);
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['error']);
  });

  it('destroys when the check rejects after data passed', async () => {
    const reason = new Error('dump broke');
    let fail: (error: Error) => void = () => undefined;
    const checks = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    const stream = gate(checks);
    const received: number[] = [];
    stream.on('data', (chunk: Buffer) => received.push(chunk.length));
    const result = outcome(stream);
    stream.write(CHUNK);
    await new Promise((resolve) => setImmediate(resolve));
    expect(received).toEqual([CHUNK.length]);

    fail(reason);
    const { ended, error } = await result;
    expect(ended).toBe(false);
    expect(error).toBe(reason);
  });

  it('wraps a rejection that is not an Error', async () => {
    const stream = gate(Promise.reject('plain text'));
    const { error } = await outcome(stream);
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('plain text');
  });
});

describe('copyDatabase', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  async function rejection(recipient: string): Promise<unknown> {
    return copyDatabase({
      databaseUrl: 'postgresql://app:pw@db/app',
      recipient,
      client: {} as never,
      bucket: 'backups',
      key: 'k',
      logger: pino({ level: 'silent' }),
    }).catch((caught: unknown) => caught);
  }

  it('rejects an invalid recipient before starting any tool', async () => {
    const error = await rejection('age1nope');
    expect(error).toBeInstanceOf(Error);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects an age private key as the recipient before starting any tool', async () => {
    const error = await rejection(await generateIdentity());
    expect(error).toBeInstanceOf(Error);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('starts the tools for a valid recipient', async () => {
    spawnMock.mockImplementation(() => {
      throw new Error('spawn reached');
    });
    const error = await rejection(await identityToRecipient(await generateIdentity()));
    expect((error as Error).message).toBe('spawn reached');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});

describe('toolLogLine', () => {
  it.each([
    'DETAIL:  Key (email)=(a@b.c) already exists.',
    'pg_dump: DETAIL:  Key (email)=(a@b.c) already exists.',
    '   DETAIL:  Key (email)=(a@b.c) already exists.',
    'CONTEXT:  COPY users, line 1: "a@b.c"',
    'pg_restore: CONTEXT:  COPY users, line 1: "a@b.c"',
    'pg_dump: detail: Query was: SELECT email FROM users',
    'detail:  Key (email)=(a@b.c) already exists.',
    'Context:  COPY users, line 1: "a@b.c"',
    'pg_dump: Detail: Query was: SELECT 1',
  ])('drops the server DETAIL or CONTEXT line %j', (line) => {
    expect(toolLogLine(line)).toBeUndefined();
  });

  it.each([
    'pg_dump: error: connection to server failed',
    'ERROR:  permission denied for table users',
    'HINT:  Use a superuser.',
    'pg_dump: error: query failed: context missing',
    'pg_dump: error: see detail: in the log',
  ])('passes the line %j as it is', (line) => {
    expect(toolLogLine(line)).toBe(line);
  });

  it('keeps a line of exactly the maximum length whole', () => {
    const line = 'x'.repeat(TOOL_LOG_LINE_MAX);
    expect(toolLogLine(line)).toBe(line);
  });

  it('cuts a longer line to its first 500 characters and an ellipsis', () => {
    const line = `${'a'.repeat(TOOL_LOG_LINE_MAX)}${'b'.repeat(100)}`;
    expect(toolLogLine(line)).toBe(`${'a'.repeat(TOOL_LOG_LINE_MAX)}…`);
  });
});

describe('copyDatabase tool log', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('logs a tool stderr without DETAIL lines and with a long line cut', async () => {
    const records: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        records.push(chunk.toString());
        callback();
      },
    });
    const longLine = `pg_dump: error: ${'z'.repeat(800)}`;

    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(),
      });
      if (args.includes('--format=custom')) {
        child.stderr.write('DETAIL:  Key (email)=(a@b.c) already exists.\n');
        child.stderr.write(`${longLine}\n`);
      }
      child.stderr.end();
      child.stdout.end();
      setImmediate(() => child.emit('close', 1, null));
      return child;
    });

    const error = await copyDatabase({
      databaseUrl: 'postgresql://app:pw@db/app',
      recipient: await identityToRecipient(await generateIdentity()),
      client: {} as never,
      bucket: 'backups',
      key: 'k',
      logger: pino({ level: 'info' }, sink),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);

    await vi.waitFor(() => {
      expect(records.join('')).toContain('zzz');
    });
    const logged = records.join('');
    expect(logged).not.toContain('DETAIL');
    expect(logged).not.toContain('a@b.c');
    expect(logged).toContain(`${longLine.slice(0, TOOL_LOG_LINE_MAX)}…`);
    expect(logged).not.toContain(longLine);
  });
});

describe('split', () => {
  it('destroys the plain branch with the error of the source', async () => {
    const source = new PassThrough();
    const plain = split(source, new PassThrough());
    const result = outcome(plain);
    const reason = new Error('pg_dump stdout broke');
    source.destroy(reason);

    const { ended, error } = await result;
    expect(ended).toBe(false);
    expect(error).toBe(reason);
  });

  it('gives both branches all the bytes', async () => {
    const seen: number[] = [];
    const check = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        seen.push(chunk.length);
        callback();
      },
    });
    const finished = new Promise<void>((resolve) => check.on('finish', resolve));
    const plain = split(Readable.from(chunks(40), { objectMode: false }), check);

    expect(await collect(plain)).toBe(40 * CHUNK.length);
    await finished;
    expect(seen.reduce((sum, size) => sum + size, 0)).toBe(40 * CHUNK.length);
  });

  it('keeps feeding the plain branch when the check stops reading and then breaks', async () => {
    // A destination that never accepts a second write, then fails like a closed pipe.
    const check = new Writable({
      highWaterMark: 1,
      write() {
        // never calls back: the input is full
      },
    });
    const source = new PassThrough();
    const plain = split(source, check);
    const total = collect(plain);

    for (const chunk of chunks(20)) source.write(chunk);
    await new Promise((resolve) => setImmediate(resolve));
    check.destroy(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    for (const chunk of chunks(20)) source.write(chunk);
    source.end();

    expect(await total).toBe(40 * CHUNK.length);
  });

  it('keeps feeding the plain branch when the check closes early', async () => {
    const check = new Writable({
      highWaterMark: 1,
      write() {
        // never calls back
      },
    });
    const source = new PassThrough();
    const plain = split(source, check);
    const total = collect(plain);

    for (const chunk of chunks(10)) source.write(chunk);
    await new Promise((resolve) => setImmediate(resolve));
    check.destroy();
    for (const chunk of chunks(30)) source.write(chunk);
    source.end();

    expect(await total).toBe(40 * CHUNK.length);
  });
});
