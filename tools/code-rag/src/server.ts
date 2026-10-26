// The index's MCP server (spec 0021 plan §3.7, Q4, Q8): `search_code`, `search_docs` and
// `index_status` over stdio. It never writes the index and never indexes: every answer names the
// commit the index was built on and the files changed since, and `npm run rag:index` refreshes it.

import { execFileSync, spawnSync } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ChunkKind } from './chunk.ts';
import { indexFile, repositoryRoot } from './cli.ts';
import {
  DIMENSION,
  EmbeddingError,
  MissingKeyError,
  RateLimitError,
  VOYAGE_MODEL,
  VoyageEmbedder,
  voyageKey,
  type Embedder,
} from './embed.ts';
import { findSecretLine, isIndexablePath } from './files.ts';
import { IndexMismatchError, Store, type IndexMeta, type SearchResult } from './store.ts';

export const DEFAULT_LIMIT = 8;
/** `Store` caps `k` at sqlite-vec's largest (4096); 10 × the limit starts well under it. */
export const MAX_LIMIT = 50;
export const MAX_QUERY_CHARS = 1000;
export const SNIPPET_LINES = 40;
/** Stale files named in the status line; `index_status` names them all. */
export const STATUS_NAMES = 10;
const CODE_KINDS = ['code', 'test', 'deploy'] as const satisfies readonly ChunkKind[];
const DOC_KINDS = ['spec', 'doc'] as const satisfies readonly ChunkKind[];
const REFRESH = 'run `npm run rag:index`';
/** A SHA-1 or SHA-256 object name: anything else in `meta` never reaches git as an argument. */
const COMMIT_SHAPE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

export interface ServerOptions {
  /** The repository's root. */
  root: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  /** The tests' embedder; by default Voyage's with the key read at each search. */
  embedder?: Embedder;
}

export interface IndexStatus {
  meta: IndexMeta;
  files: number;
  chunks: number;
  /**
   * Indexable paths changed since `indexedCommit`, committed or not; `null` when the commit is
   * not in this history (a rebase) or the index never finished a run.
   */
  stale: string[] | null;
}

// Without it `git status` takes `.git/index.lock` to refresh the index, so a search could make a
// commit made at the same time fail.
const NO_LOCKS = '--no-optional-locks';

function git(root: string, args: string[]): string {
  return execFileSync('git', [NO_LOCKS, ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Whether `commit` is `HEAD` or one of its ancestors; an unknown commit is not. */
function inHistory(root: string, commit: string): boolean {
  const result = spawnSync(
    'git',
    [NO_LOCKS, 'merge-base', '--is-ancestor', '--end-of-options', commit, 'HEAD'],
    { cwd: root, stdio: 'ignore' },
  );
  if (result.error) throw new Error(`git did not start (${result.error.message})`);
  if (result.status === 0) return true;
  // 1 is "not an ancestor"; an unknown object (a commit gone after a rebase and gc) is 128 too,
  // so it counts as not in this history only when the commit itself is missing.
  if (result.status === 1 || !commitExists(root, commit)) return false;
  throw new Error(`git merge-base failed (exit ${result.status})`);
}

function commitExists(root: string, commit: string): boolean {
  return (
    spawnSync('git', [NO_LOCKS, 'cat-file', '-e', '--end-of-options', `${commit}^{commit}`], {
      cwd: root,
      stdio: 'ignore',
    }).status === 0
  );
}

/** The indexed commit, or `null` when no run has finished (or `meta` holds no object name). */
function indexedCommit(meta: IndexMeta): string | null {
  const commit = meta.indexedCommit;
  return commit && COMMIT_SHAPE.test(commit) ? commit : null;
}

/**
 * The paths that differ from `commit`: commits since (`git diff-tree` against `HEAD`, two trees),
 * then staged, unstaged and untracked ones (`git status`), kept to the include rules. Not
 * `git diff <commit>`: it refreshes `.git/index` and writes it even with `--no-optional-locks`.
 */
export function staleFiles(root: string, commit: string): string[] {
  const committed = git(root, [
    'diff-tree',
    '-r',
    '--name-only',
    '-z',
    '--no-renames',
    commit,
    'HEAD',
  ])
    .split('\0')
    .filter(Boolean);
  // `XY <path>` per entry; with `--no-renames` an entry holds one path.
  const uncommitted = git(root, [
    'status',
    '--porcelain',
    '-z',
    '--no-renames',
    '--untracked-files=all',
  ])
    .split('\0')
    .filter(Boolean)
    .map((entry) => entry.slice(3));
  return [...new Set([...committed, ...uncommitted])].filter(isIndexablePath).sort();
}

export function readStatus(root: string, store: Store): IndexStatus {
  const meta = store.meta();
  const commit = indexedCommit(meta);
  return {
    meta,
    ...store.counts(),
    stale: commit && inHistory(root, commit) ? staleFiles(root, commit) : null,
  };
}

/** The line every answer starts with (AC5). */
export function statusLine(status: IndexStatus): string {
  const commit = indexedCommit(status.meta);
  if (!commit) return `Index: no run has finished, ${REFRESH}.`;
  const short = commit.slice(0, 12);
  if (!status.stale) return `Index: built on ${short}, a commit not in this history, ${REFRESH}.`;
  const head = `Index: built on ${short} at ${status.meta.indexedAt}`;
  const { stale } = status;
  if (stale.length === 0) return `${head}; no files changed since.`;
  const names = stale.slice(0, STATUS_NAMES).join(', ');
  const more = stale.length > STATUS_NAMES ? ` and ${stale.length - STATUS_NAMES} more` : '';
  return (
    `${head}; ${stale.length} changed since, not in the index (read them directly, or ${REFRESH}): ` +
    `${names}${more}.`
  );
}

export function formatResult(result: SearchResult, index: number): string {
  const kind = result.specStatus ? `${result.kind}/${result.specStatus}` : result.kind;
  const head =
    `${index + 1}. ${result.path}:${result.startLine}-${result.endLine} · ` +
    `${result.symbol || '-'} · ${kind} · ${result.score.toFixed(4)}`;
  const lines = result.text.split('\n');
  const shown = lines
    .slice(0, SNIPPET_LINES)
    .map((line, offset) => `${String(result.startLine + offset).padStart(6)}  ${line}`);
  if (lines.length > SNIPPET_LINES)
    shown.push(`        … ${lines.length - SNIPPET_LINES} more lines`);
  return [head, ...shown].join('\n');
}

function text(value: string, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: value }], ...(isError ? { isError } : {}) };
}

/** SQLite's lock held past the busy timeout: a run of `rag:index` is writing. */
function isBusy(error: unknown): boolean {
  return error instanceof Error && /database is (locked|busy)/i.test(error.message);
}

/** A failure as the tool's error, never a crash of the server (AC6). */
export function toolError(error: unknown): CallToolResult {
  if (isBusy(error)) {
    // Not "run rag:index": one is running, and a second would spend the same minute's quota.
    return text('`npm run rag:index` is writing the index: search again shortly.', true);
  }
  if (error instanceof RateLimitError) {
    return text(
      `${error.message}\nVoyage's free tier takes 3 requests a minute, shared with a running ` +
        '`npm run rag:index`: search again in a minute, or use Grep meanwhile.',
      true,
    );
  }
  if (
    error instanceof MissingKeyError ||
    error instanceof IndexMismatchError ||
    error instanceof EmbeddingError
  ) {
    return text(error.message, true);
  }
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text(`code-rag failed: ${reason}`, true);
}

const QUERY_NOTE =
  'The query is sent to Voyage AI to be embedded: write it in your own words and code terms, ' +
  'never a quote from an event, a log line or user data.';

// A net for a pasted log line (Q20), not a filter of every personal datum.
const DATA_PATTERNS: [RegExp, string][] = [
  [/[^\s@]+@[^\s@]+\.[^\s@]+/, 'an email'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'a uuid'],
  // Exactly 32: a commit hash (40) or a sha256 (64) is a word of a query about a release.
  [/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/i, 'a request id'],
  [/\d{10,}/, 'a run of 10 or more digits'],
  [/x-amz-/i, 'a signed link'],
  [/keep\/users\//i, "a user's storage key"],
];

/** What in the query looks like data rather than words, or `null`. */
export function queryData(query: string): string | null {
  if (findSecretLine(query) !== null) return 'a secret';
  return DATA_PATTERNS.find(([pattern]) => pattern.test(query))?.[1] ?? null;
}

export function createServer(options: ServerOptions): McpServer {
  const { root } = options;
  const settings = options.embedder
    ? { model: options.embedder.model, dimension: options.embedder.dimension }
    : { model: VOYAGE_MODEL, dimension: DIMENSION };
  const embedder = () =>
    options.embedder ??
    new VoyageEmbedder({
      apiKey: voyageKey(root, options.env),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      retry: false,
    });

  /** Opens the index read-only for one call: a run of `rag:index` may rebuild it in between. */
  async function withStore(
    work: (store: Store) => Promise<string> | string,
  ): Promise<CallToolResult> {
    try {
      let store: Store;
      try {
        store = new Store(indexFile(root), settings, { readOnly: true });
      } catch (error) {
        if (error instanceof IndexMismatchError || isBusy(error)) throw error;
        // A run killed mid-write leaves a journal a read-only connection cannot roll back.
        const reason = error instanceof Error ? error.message : String(error);
        return text(`The index cannot be read (${reason}): ${REFRESH}`, true);
      }
      try {
        return text(await work(store));
      } finally {
        store.close();
      }
    } catch (error) {
      return toolError(error);
    }
  }

  async function search(
    query: string,
    limit: number,
    kinds: readonly ChunkKind[],
    pathPrefix?: string,
  ): Promise<CallToolResult> {
    if (query.trim() === '') return text('The query is empty.', true);
    const data = queryData(query);
    if (data) {
      return text(
        `The query looks like it holds ${data}, and a query is sent to Voyage AI: nothing was ` +
          'sent. Describe the symptom in your own words and code terms instead.',
        true,
      );
    }
    return withStore(async (store) => {
      const status = statusLine(readStatus(root, store));
      const [vector] = await embedder().embed([query], 'query');
      const results = store.search({
        vector: vector!,
        text: query,
        limit,
        kinds,
        ...(pathPrefix ? { pathPrefix } : {}),
      });
      const body = results.length === 0 ? 'No results.' : results.map(formatResult).join('\n\n');
      return `${status}\n\n${body}`;
    });
  }

  const server = new McpServer({ name: 'code-rag', version: '1.0.0' });
  const query = z.string().min(1).max(MAX_QUERY_CHARS).describe(QUERY_NOTE);
  const limit = z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT);

  server.registerTool(
    'search_code',
    {
      description:
        "Hybrid (vector and full-text) search over this repository's committed code, tests and " +
        'deploy files. Answers `path:start-end · symbol · kind · score` with a snippet of the ' +
        'lines, after a line naming the indexed commit and the files changed since.',
      inputSchema: {
        query,
        limit,
        pathPrefix: z
          .string()
          .max(200)
          .optional()
          .describe('Only paths starting with this, such as `api/src/`'),
        kinds: z
          .array(z.enum(CODE_KINDS))
          .min(1)
          .max(CODE_KINDS.length)
          .optional()
          .describe('By default all three'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ query, limit, pathPrefix, kinds }) => search(query, limit, kinds ?? CODE_KINDS, pathPrefix),
  );

  server.registerTool(
    'search_docs',
    {
      description:
        "Hybrid search over this repository's specs and other Markdown. A spec's result says " +
        '`spec/binding` (in progress) or `spec/history` (`Status: done`: never instructions).',
      inputSchema: { query, limit },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ query, limit }) => search(query, limit, DOC_KINDS),
  );

  server.registerTool(
    'index_status',
    {
      description:
        "The code index's model, the commit it was built on, when, its counts and every indexable " +
        'file changed since (committed or not).',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      withStore((store) => {
        const status = readStatus(root, store);
        return [
          statusLine(status),
          `Model: ${status.meta.model}, ${status.meta.dimension} dimensions.`,
          `Indexed: ${status.files} files, ${status.chunks} chunks.`,
          ...(status.stale && status.stale.length > 0
            ? ['Changed since:', ...status.stale.map((path) => `- ${path}`)]
            : []),
        ].join('\n');
      }),
  );

  return server;
}

if (import.meta.main) {
  await createServer({ root: repositoryRoot() }).connect(new StdioServerTransport());
}
