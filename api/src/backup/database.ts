import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { PassThrough, Readable, Transform, type Writable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';

import type { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Encrypter } from 'age-encryption';
import type { Logger } from 'pino';

import { StorageError } from '../storage/storage.error.js';
import { postgresEnv } from './config.js';
import { loggedKey } from './keys.js';

// One part in memory at a time, whatever the database's size (plan §2).
export const PART_SIZE = 8 * 1024 * 1024;

export interface DatabaseCopyOptions {
  databaseUrl: string;
  // The age public key every copy is encrypted to (P5).
  recipient: string;
  // The write-only client of the backup bucket, and the copy's key there (keys.ts).
  client: S3Client;
  bucket: string;
  key: string;
  logger: Logger;
  // Put in front of every PostgreSQL tool: none in the image, which has pg_dump 18; the tests run
  // the tools of their PostgreSQL container with `docker exec -i …` (plan §7). A failure then
  // kills the docker client, not the tool, which runs on until its pipe breaks.
  toolPrefix?: readonly string[];
  // The tools' environment besides the connection; only PATH and HOME by default, so they never
  // see the job's S3 keys.
  toolEnv?: NodeJS.ProcessEnv;
}

export interface DatabaseCopy {
  key: string;
  // Of the encrypted copy as stored.
  bytes: number;
}

// A dump that pg_dump or the check refused (plan §2); nothing was stored.
export class DatabaseCopyError extends Error {
  override readonly name = 'DatabaseCopyError';
}

interface Tool {
  child: ChildProcess;
  // Resolves when the tool exits 0, rejects on any other end.
  exited: Promise<void>;
}

// Copies the database encrypted into the backup bucket (plan §2): pg_dump's output goes both to
// `pg_restore --list`, the check that it is a readable dump (P7), and through age to the upload.
// Nothing touches the disk (P13). The gate holds the upload's end back until both tools exited 0,
// so a copy that failed is never stored (AC4). Throws DatabaseCopyError for a failed dump or
// check, StorageError for a failed upload; neither carries a key or the password.
export async function copyDatabase(options: DatabaseCopyOptions): Promise<DatabaseCopy> {
  const { logger } = options;
  // Everything that can fail before the tools start goes first: a tool left running would block
  // on a full pipe for good, holding a connection and a snapshot.
  const encrypter = new Encrypter();
  encrypter.addRecipient(options.recipient);
  const env = toolEnvironment(options.databaseUrl, options.toolEnv);
  const prefix = options.toolPrefix ?? [];
  const dump = startTool('pg_dump', ['--format=custom'], { prefix, env, logger, output: true });
  const check = startTool('pg_restore', ['--list'], { prefix, env, logger, input: true });
  const plain = split(dump.child.stdout as Readable, check.child.stdin as Writable);

  // Recorded before the gate's own handler runs, so a failed upload can tell whether the tools
  // caused it.
  let toolError: Error | undefined;
  const tools = Promise.all([dump.exited, check.exited]).then(() => undefined);
  tools.catch((error: unknown) => {
    toolError = error instanceof Error ? error : new DatabaseCopyError(String(error));
  });

  let encrypted: Readable | undefined;
  let bytes = 0;
  try {
    encrypted = Readable.fromWeb(
      (await encrypter.encrypt(
        Readable.toWeb(plain) as globalThis.ReadableStream<Uint8Array>,
      )) as ReadableStream<Uint8Array>,
    );
    const body = encrypted.pipe(gate(tools));
    // A second reader of the piped stream, so it takes nothing from the upload.
    encrypted.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
    });
    // pipe() does not pass errors on; the upload reads the body.
    encrypted.on('error', (error) => body.destroy(error));

    await new Upload({
      client: options.client,
      params: { Bucket: options.bucket, Key: options.key, Body: body },
      partSize: PART_SIZE,
      queueSize: 1,
    }).done();
  } catch (error) {
    dump.child.kill();
    check.child.kill();
    plain.destroy();
    encrypted?.destroy();
    // Before the stream exists the failure is age's, which carries no key.
    throw toolError ?? (encrypted === undefined ? error : StorageError.from('upload', error));
  }
  logger.info({ key: loggedKey(options.key), bytes }, 'Database copy stored');
  return { key: options.key, bytes };
}

// The PostgreSQL tools' environment: only PATH and HOME of the job's own, so they never see its S3
// keys, then `extra` and the connection (plan §1).
export function toolEnvironment(databaseUrl: string, extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    ...extra,
    ...postgresEnv(databaseUrl),
  };
}

export interface StartOptions {
  prefix: readonly string[];
  env: NodeJS.ProcessEnv;
  logger: Logger;
  // Whether the tool reads stdin and writes stdout we use; else they are closed.
  input?: boolean;
  output?: boolean;
}

// Starts a PostgreSQL tool; its stderr goes to the log through toolLogLine (P17).
export function startTool(name: string, args: string[], options: StartOptions): Tool {
  const [command = name, ...rest] = [...options.prefix, name, ...args];
  const child = spawn(command, rest, {
    env: options.env,
    stdio: [
      options.input === true ? 'pipe' : 'ignore',
      options.output === true ? 'pipe' : 'ignore',
      'pipe',
    ],
  });
  createInterface({ input: child.stderr as Readable }).on('line', (line) => {
    const logged = toolLogLine(line);
    if (logged !== undefined) options.logger.warn({ tool: name }, logged);
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', (error) => {
      reject(new DatabaseCopyError(`${name} did not start: ${error.message}`));
    });
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new DatabaseCopyError(`${name} exited with ${signal ?? `code ${code}`}`));
    });
  });
  return { child, exited };
}

export const TOOL_LOG_LINE_MAX = 500;

// What of a tool's stderr line goes to the log (P17). The password is in the environment, but a
// server's DETAIL or CONTEXT line can quote a table's values (`Key (email)=(…)`), and so can a
// tool's own `detail:` line: they are dropped, and the rest is cut short.
export function toolLogLine(line: string): string | undefined {
  if (/^\s*(\w+:\s+)?(DETAIL|CONTEXT):/i.test(line)) return undefined;
  return line.length > TOOL_LOG_LINE_MAX ? `${line.slice(0, TOOL_LOG_LINE_MAX)}…` : line;
}

// Feeds `source` to `check` and returns its other branch. `pg_restore --list` may exit after the
// table of contents without reading the rest: once its input breaks (EPIPE) or ends, the check's
// branch is dropped, so the other neither fails nor waits on it (plan §2).
export function split(source: Readable, check: Writable): Readable {
  const plain = new PassThrough();
  source.pipe(plain);
  source.pipe(check);
  // pipe() unpipes a destination that errors or closes, and stops waiting for its 'drain'; a
  // listener of our own keeps the error from being thrown.
  check.on('error', () => undefined);
  // pipe() does not pass a source's error on; this one reaches the upload through age.
  source.on('error', (error) => plain.destroy(error));
  return plain;
}

// Passes the encrypted stream through, but holds its end back until `checks` resolves; if they
// reject, the stream is destroyed with their error, so the upload aborts or never sends its single
// PutObject (plan §2).
export function gate(checks: Promise<void>): Transform {
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      callback(null, chunk);
    },
    flush(callback) {
      // A rejection destroys the stream below; its end never comes.
      checks.then(
        () => callback(),
        () => undefined,
      );
    },
  });
  checks.catch((error: unknown) => {
    stream.destroy(error instanceof Error ? error : new Error(String(error)));
  });
  return stream;
}
