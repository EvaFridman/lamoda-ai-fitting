// Brings the index up to the selected files (spec 0021 plan §3.6, Q8): only files whose blob hash
// changed are chunked and embedded, removed ones are deleted, and a chunk that looks like a secret
// is never sent.

import { chunkFile, embeddedText, type Chunk } from './chunk.ts';
import { estimateTokens, MAX_BATCH_TEXTS, MAX_BATCH_TOKENS, type Embedder } from './embed.ts';
import { findSecretLine, type TrackedFile } from './files.ts';
import type { Store } from './store.ts';

export interface SecretSkip {
  path: string;
  startLine: number;
  endLine: number;
  /** The file's line that matched, or `null` when the match is in the chunk's path or symbol. */
  line: number | null;
}

export interface PreparedFile {
  path: string;
  blobHash: string;
  chunks: Chunk[];
  secrets: SecretSkip[];
  tokens: number;
}

/** A file's chunks, those whose embedded text (path and symbol too) looks like a secret left out. */
export function prepareFile(path: string, blobHash: string, text: string): PreparedFile {
  const chunks: Chunk[] = [];
  const secrets: SecretSkip[] = [];
  let tokens = 0;
  for (const chunk of chunkFile({ path, text, blobHash })) {
    const embedded = embeddedText(chunk);
    // The first line of the embedded text is `<path> <symbol>`, the file's lines follow.
    const index = findSecretLine(embedded);
    if (index !== null) {
      const { startLine, endLine } = chunk;
      secrets.push({ path, startLine, endLine, line: index === 0 ? null : startLine + index - 1 });
      continue;
    }
    chunks.push(chunk);
    tokens += estimateTokens(embedded);
  }
  return { path, blobHash, chunks, secrets, tokens };
}

export function describeSecret(skip: SecretSkip): string {
  const where = skip.line === null ? 'its path or symbol' : `line ${skip.line}`;
  return `${skip.path}:${skip.startLine}-${skip.endLine} looks like it holds a secret (${where}): not indexed`;
}

export interface IndexSummary {
  seen: number;
  unchanged: number;
  embedded: number;
  removed: number;
  chunks: number;
  tokens: number;
  secrets: number;
}

export interface UpdateOptions {
  files: TrackedFile[];
  /** Each blob's text by its hash. */
  readBlobs: (hashes: string[]) => Map<string, string>;
  store: Store;
  embedder: Embedder;
  log?: (line: string) => void;
}

export async function updateIndex(options: UpdateOptions): Promise<IndexSummary> {
  const { files, store, embedder } = options;
  const log = options.log ?? (() => {});
  const indexed = store.fileHashes();
  const current = new Set(files.map((file) => file.path));

  let removed = 0;
  for (const path of indexed.keys()) {
    if (!current.has(path)) {
      store.removeFile(path);
      removed++;
    }
  }

  const changed = files.filter((file) => indexed.get(file.path) !== file.blobHash);
  const blobs = options.readBlobs(changed.map((file) => file.blobHash));
  const summary: IndexSummary = {
    seen: files.length,
    unchanged: files.length - changed.length,
    embedded: 0,
    removed,
    chunks: 0,
    tokens: 0,
    secrets: 0,
  };

  // Files go to the embedder in groups about one request's size, each written once its vectors
  // are back, so a failure keeps what was done.
  let group: PreparedFile[] = [];
  let groupChunks = 0;
  let groupTokens = 0;
  const flush = async () => {
    if (group.length === 0) return;
    const chunks = group.flatMap((file) => file.chunks);
    const vectors = await embedder.embed(chunks.map(embeddedText), 'document');
    let offset = 0;
    for (const file of group) {
      const count = file.chunks.length;
      store.replaceFile(
        file.path,
        file.blobHash,
        file.chunks,
        vectors.slice(offset, offset + count),
      );
      offset += count;
    }
    summary.embedded += group.length;
    summary.chunks += groupChunks;
    summary.tokens += groupTokens;
    log(`embedded ${summary.embedded}/${changed.length} files, ~${summary.tokens} tokens`);
    group = [];
    groupChunks = 0;
    groupTokens = 0;
  };

  for (const file of changed) {
    const text = blobs.get(file.blobHash);
    if (text === undefined) throw new Error(`No content for ${file.path}`);
    const prepared = prepareFile(file.path, file.blobHash, text);
    for (const skip of prepared.secrets) log(describeSecret(skip));
    summary.secrets += prepared.secrets.length;
    if (
      group.length > 0 &&
      (groupChunks + prepared.chunks.length > MAX_BATCH_TEXTS ||
        groupTokens + prepared.tokens > MAX_BATCH_TOKENS)
    ) {
      await flush();
    }
    group.push(prepared);
    groupChunks += prepared.chunks.length;
    groupTokens += prepared.tokens;
  }
  await flush();
  return summary;
}
