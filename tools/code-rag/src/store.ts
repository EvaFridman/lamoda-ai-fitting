// The index's one SQLite file (spec 0021 plan §3.5, Q6): Node's `node:sqlite` with the `sqlite-vec`
// extension; vectors in a `vec0` table, words in FTS5, and a search that merges both rankings.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getLoadablePath } from 'sqlite-vec';
import type { Chunk, ChunkKind, SpecStatus } from './chunk.ts';

/**
 * Goes up with any change to the tables, to what a chunk holds, to how files are cut
 * (`chunk.ts`) or to what counts as a secret (`files.ts`): unchanged files are never cut again,
 * so only a rebuild applies such a change to them.
 */
export const SCHEMA_VERSION = 2;
/** Reciprocal rank fusion's constant. */
const RRF_K = 60;
/** Each list asks for this many times the limit, after the filters. */
const CANDIDATES_PER_RESULT = 10;
/** sqlite-vec's largest `k`. */
const MAX_K = 4096;
/** How long a statement waits for the other connection's lock (the server reads while the index is written). */
const BUSY_TIMEOUT_MS = 5000;

export interface StoreSettings {
  model: string;
  dimension: number;
}

export interface IndexMeta extends StoreSettings {
  schemaVersion: number;
  indexedCommit: string | null;
  indexedAt: string | null;
}

export interface SearchQuery {
  vector: Float32Array;
  /** The query as typed: its words go to FTS5. */
  text: string;
  limit: number;
  kinds?: readonly ChunkKind[];
  pathPrefix?: string;
}

export interface SearchResult {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  kind: ChunkKind;
  symbol: string;
  specStatus: SpecStatus | null;
  text: string;
  score: number;
}

export class IndexMismatchError extends Error {
  constructor(reason: string) {
    super(
      `${reason === 'never' ? 'The index is empty' : `The index was built ${reason}`}: ` +
        'run `npm run rag:index`',
    );
    this.name = 'IndexMismatchError';
  }
}

interface ChunkRow {
  id: string;
  path: string;
  start_line: number;
  end_line: number;
  kind: ChunkKind;
  symbol: string;
  spec_status: SpecStatus | null;
  text: string;
}

function bytes(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
}

/** The query's words, each quoted for FTS5 and joined by `OR`; `null` when it has none. */
export function ftsQuery(text: string): string | null {
  const words = text.match(/[\p{L}\p{N}_]+/gu);
  return words ? words.map((word) => `"${word}"`).join(' OR ') : null;
}

export class Store {
  readonly #db: DatabaseSync;
  readonly #settings: StoreSettings;
  /** Why the index was emptied at open (the code's schema, model or dimension changed), or `null`. */
  readonly rebuildReason: string | null;

  /**
   * Opens (and creates) the index. A read-only store never writes and refuses an index of
   * another schema, model or dimension with `IndexMismatchError`; a writable one empties it.
   */
  constructor(file: string, settings: StoreSettings, options: { readOnly?: boolean } = {}) {
    if (!Number.isInteger(settings.dimension) || settings.dimension <= 0) {
      throw new Error(`Bad dimension: ${settings.dimension}`);
    }
    this.#settings = settings;
    if (options.readOnly && !existsSync(file)) throw new IndexMismatchError('never');
    if (!options.readOnly && file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.#db = new DatabaseSync(file, {
      allowExtension: true,
      readOnly: options.readOnly ?? false,
      timeout: BUSY_TIMEOUT_MS,
    });
    try {
      this.#db.loadExtension(getLoadablePath());
      this.#db.enableLoadExtension(false);
      const reason = this.#mismatch();
      if (options.readOnly) {
        if (reason) throw new IndexMismatchError(reason);
        this.rebuildReason = null;
      } else {
        this.rebuildReason = reason === 'never' ? null : reason;
        if (reason) this.#create();
      }
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }

  #metaValues(): Map<string, string> {
    const exists = this.#db
      .prepare("select 1 from sqlite_master where type = 'table' and name = 'meta'")
      .get();
    if (!exists) return new Map();
    const rows = this.#db.prepare('select key, value from meta').all() as {
      key: string;
      value: string;
    }[];
    return new Map(rows.map((row) => [row.key, row.value]));
  }

  /** `never` for a new file, a reason for another schema, model or dimension, else `null`. */
  #mismatch(): string | null {
    const meta = this.#metaValues();
    if (meta.size === 0) return 'never';
    if (meta.get('schemaVersion') !== String(SCHEMA_VERSION)) {
      return `with schema ${meta.get('schemaVersion')}, the code's is ${SCHEMA_VERSION}`;
    }
    if (meta.get('model') !== this.#settings.model) {
      return `with the model ${meta.get('model')}, the code's is ${this.#settings.model}`;
    }
    if (meta.get('dimension') !== String(this.#settings.dimension)) {
      return `with ${meta.get('dimension')} dimensions, the code's are ${this.#settings.dimension}`;
    }
    return null;
  }

  #transaction<T>(work: () => T): T {
    this.#db.exec('begin');
    try {
      const result = work();
      this.#db.exec('commit');
      return result;
    } catch (error) {
      // SQLite may have rolled back by itself; the error that matters is the first one.
      if (this.#db.isTransaction) this.#db.exec('rollback');
      throw error;
    }
  }

  #create(): void {
    const { model, dimension } = this.#settings;
    this.#transaction(() => {
      this.#db.exec(`
        drop table if exists meta;
        drop table if exists files;
        drop table if exists chunks;
        drop table if exists chunks_vec;
        drop table if exists chunks_fts;
        create table meta (key text primary key, value text not null);
        create table files (path text primary key, blob_hash text not null, chunk_count integer not null);
        -- \`seq\`, the rowid its FTS5 row shares, is a column so that VACUUM never renumbers it.
        create table chunks (
          seq integer primary key,
          id text not null unique,
          path text not null,
          start_line integer not null,
          end_line integer not null,
          kind text not null,
          symbol text not null,
          spec_status text,
          text text not null,
          blob_hash text not null
        );
        create index chunks_path on chunks (path);
        create virtual table chunks_vec using vec0(
          id text primary key,
          embedding float[${dimension}] distance_metric=cosine
        );
        create virtual table chunks_fts using fts5(id unindexed, symbol, text, path);
      `);
      const insert = this.#db.prepare('insert into meta (key, value) values (?, ?)');
      insert.run('schemaVersion', String(SCHEMA_VERSION));
      insert.run('model', model);
      insert.run('dimension', String(dimension));
    });
  }

  /** Empties the index (`--full`). */
  clear(): void {
    this.#create();
  }

  close(): void {
    this.#db.close();
  }

  meta(): IndexMeta {
    const meta = this.#metaValues();
    return {
      schemaVersion: Number(meta.get('schemaVersion')),
      model: meta.get('model') ?? '',
      dimension: Number(meta.get('dimension')),
      indexedCommit: meta.get('indexedCommit') ?? null,
      indexedAt: meta.get('indexedAt') ?? null,
    };
  }

  counts(): { files: number; chunks: number } {
    const count = (table: string) =>
      (this.#db.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
    return { files: count('files'), chunks: count('chunks') };
  }

  /** Each indexed file's blob hash. */
  fileHashes(): Map<string, string> {
    const rows = this.#db.prepare('select path, blob_hash from files').all() as {
      path: string;
      blob_hash: string;
    }[];
    return new Map(rows.map((row) => [row.path, row.blob_hash]));
  }

  #deleteFile(path: string): void {
    const ids = this.#db.prepare('select id from chunks where path = ?').all(path) as {
      id: string;
    }[];
    const deleteVec = this.#db.prepare('delete from chunks_vec where id = ?');
    for (const { id } of ids) deleteVec.run(id);
    // An FTS5 row shares its chunk's rowid, so it is deleted by rowid, not by a scan.
    this.#db
      .prepare('delete from chunks_fts where rowid in (select seq from chunks where path = ?)')
      .run(path);
    this.#db.prepare('delete from chunks where path = ?').run(path);
    this.#db.prepare('delete from files where path = ?').run(path);
  }

  removeFile(path: string): void {
    this.#transaction(() => this.#deleteFile(path));
  }

  /** Replaces a file's chunks in one transaction; `vectors[i]` is `chunks[i]`'s. */
  replaceFile(path: string, blobHash: string, chunks: Chunk[], vectors: Float32Array[]): void {
    if (vectors.length !== chunks.length) throw new Error('One vector per chunk');
    for (const vector of vectors) {
      if (vector.length !== this.#settings.dimension) throw new Error('Wrong vector dimension');
    }
    this.#transaction(() => {
      this.#deleteFile(path);
      const insertChunk = this.#db.prepare(
        `insert into chunks (id, path, start_line, end_line, kind, symbol, spec_status, text, blob_hash)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertVec = this.#db.prepare('insert into chunks_vec (id, embedding) values (?, ?)');
      const insertFts = this.#db.prepare(
        'insert into chunks_fts (rowid, id, symbol, text, path) values (?, ?, ?, ?, ?)',
      );
      chunks.forEach((chunk, index) => {
        const { lastInsertRowid } = insertChunk.run(
          chunk.id,
          chunk.path,
          chunk.startLine,
          chunk.endLine,
          chunk.kind,
          chunk.symbol,
          chunk.specStatus,
          chunk.text,
          chunk.blobHash,
        );
        insertVec.run(chunk.id, bytes(vectors[index]!));
        insertFts.run(lastInsertRowid, chunk.id, chunk.symbol, chunk.text, chunk.path);
      });
      this.#db
        .prepare('insert into files (path, blob_hash, chunk_count) values (?, ?, ?)')
        .run(path, blobHash, chunks.length);
    });
  }

  /**
   * Forgets the indexed commit while a run changes the files, so a run that stops halfway (on
   * another branch, say) answers "no run has finished" instead of a commit the index no longer is.
   */
  clearIndexed(): void {
    this.#db.prepare("delete from meta where key in ('indexedCommit', 'indexedAt')").run();
  }

  setIndexed(commit: string, at: Date): void {
    this.#transaction(() => {
      const upsert = this.#db.prepare(
        'insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value',
      );
      upsert.run('indexedCommit', commit);
      upsert.run('indexedAt', at.toISOString());
    });
  }

  /** The nearest chunks that pass the filters, nearest first: `k` grows until enough pass. */
  #nearest(query: SearchQuery, wanted: number, passes: (row: ChunkRow) => boolean): string[] {
    for (let k = wanted; ; k = Math.min(k * 4, MAX_K)) {
      const rows = this.#db
        .prepare(
          `with nearest as (
             select id, distance from chunks_vec where embedding match ? and k = ?
           )
           select c.id, c.path, c.kind from nearest n join chunks c on c.id = n.id
           order by n.distance`,
        )
        .all(bytes(query.vector), k) as unknown as ChunkRow[];
      const passed = rows.filter(passes).map((row) => row.id);
      if (passed.length >= wanted || rows.length < k || k === MAX_K) return passed.slice(0, wanted);
    }
  }

  /** The best FTS5 matches that pass the filters, best first. */
  #best(query: SearchQuery, wanted: number): string[] {
    const match = ftsQuery(query.text);
    if (!match) return [];
    const where: string[] = [];
    const params: (string | number)[] = [match];
    if (query.kinds) {
      where.push(`c.kind in (${query.kinds.map(() => '?').join(', ')})`);
      params.push(...query.kinds);
    }
    if (query.pathPrefix) {
      where.push('substr(c.path, 1, ?) = ?');
      params.push(query.pathPrefix.length, query.pathPrefix);
    }
    params.push(wanted);
    const rows = this.#db
      .prepare(
        `select c.id from chunks_fts f join chunks c on c.seq = f.rowid
         where chunks_fts match ? ${where.map((condition) => `and ${condition}`).join(' ')}
         order by bm25(chunks_fts) limit ?`,
      )
      .all(...params) as { id: string }[];
    return rows.map((row) => row.id);
  }

  /**
   * Hybrid search: the nearest vectors and the best FTS5 matches that pass the kind and path
   * prefix filters (`10 × limit` each), merged by reciprocal rank fusion, cut to the limit.
   */
  search(query: SearchQuery): SearchResult[] {
    if (!Number.isInteger(query.limit) || query.limit < 1) {
      throw new Error(`Bad limit: ${query.limit}`);
    }
    if (query.kinds?.length === 0) return [];
    const wanted = Math.min(query.limit * CANDIDATES_PER_RESULT, MAX_K);
    const kinds = query.kinds && new Set(query.kinds);
    const passes = (row: ChunkRow) =>
      (!kinds || kinds.has(row.kind)) &&
      (!query.pathPrefix || row.path.startsWith(query.pathPrefix));

    const scores = new Map<string, number>();
    const add = (ids: string[]) =>
      ids.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
    add(this.#nearest(query, wanted, passes));
    add(this.#best(query, wanted));
    if (scores.size === 0) return [];

    const ids = [...scores.keys()];
    const rows = this.#db
      .prepare(
        `select id, path, start_line, end_line, kind, symbol, spec_status, text from chunks
         where id in (${ids.map(() => '?').join(', ')})`,
      )
      .all(...ids) as unknown as ChunkRow[];
    return rows
      .map((row) => ({
        id: row.id,
        path: row.path,
        startLine: row.start_line,
        endLine: row.end_line,
        kind: row.kind,
        symbol: row.symbol,
        specStatus: row.spec_status,
        text: row.text,
        score: scores.get(row.id)!,
      }))
      .sort(
        (a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.startLine - b.startLine,
      )
      .slice(0, query.limit);
  }
}
