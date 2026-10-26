// `npm run rag:index` (spec 0021 plan §3.6): `index` brings `.rag/index.sqlite` up to the tracked
// files, `--full` rebuilds it, `--dry-run` lists what would be indexed and skipped, with no key.

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { DIMENSION, VOYAGE_MODEL, VoyageEmbedder, voyageKey } from './embed.ts';
import { listTrackedFiles, readBlobs, selectFiles } from './files.ts';
import { describeSecret, prepareFile, updateIndex } from './indexer.ts';
import { Store } from './store.ts';

const USAGE = 'Usage: node src/cli.ts index [--full | --dry-run]';

type Print = (line: string) => void;

export function repositoryRoot(cwd = process.cwd()): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
}

export function indexFile(root: string): string {
  return join(root, '.rag', 'index.sqlite');
}

function seconds(since: number): string {
  return `${((performance.now() - since) / 1000).toFixed(1)} s`;
}

function dryRun(root: string, print: Print): void {
  const { included, skipped } = selectFiles(listTrackedFiles(root));
  const blobs = readBlobs(
    root,
    included.map((file) => file.blobHash),
  );
  let chunks = 0;
  let tokens = 0;
  let secrets = 0;
  for (const file of included) {
    const prepared = prepareFile(file.path, file.blobHash, blobs.get(file.blobHash)!);
    print(`index   ${file.path} (${prepared.chunks.length} chunks)`);
    for (const skip of prepared.secrets) print(`secret  ${describeSecret(skip)}`);
    chunks += prepared.chunks.length;
    tokens += prepared.tokens;
    secrets += prepared.secrets.length;
  }
  // Files outside the included places are many and say nothing; they are only counted.
  const outside = skipped.filter((skip) => skip.reason === 'outside').length;
  for (const skip of skipped) {
    if (skip.reason !== 'outside') print(`skip    ${skip.path} (${skip.reason})`);
  }
  print(
    `Dry run: ${included.length} files, ${chunks} chunks (~${tokens} tokens) would be indexed; ` +
      `${skipped.length - outside} files skipped, ${outside} outside the included places; ` +
      `${secrets} chunks skipped as secrets.`,
  );
}

async function index(
  root: string,
  full: boolean,
  env: NodeJS.ProcessEnv,
  print: Print,
): Promise<void> {
  const started = performance.now();
  // Before anything else, so a missing key makes no request and touches no file.
  const apiKey = voyageKey(root, env);
  const embedder = new VoyageEmbedder({ apiKey });
  const store = new Store(indexFile(root), { model: VOYAGE_MODEL, dimension: DIMENSION });
  try {
    if (store.rebuildReason) {
      print(`Rebuilding: the index was built ${store.rebuildReason}.`);
    } else if (full) {
      print('Rebuilding (--full).');
      store.clear();
    }
    // The files of exactly the commit recorded, so a commit made during a long run is not indexed
    // and counts as not indexed.
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    const files = selectFiles(listTrackedFiles(root, commit)).included;
    const summary = await updateIndex({
      files,
      readBlobs: (hashes) => readBlobs(root, hashes),
      store,
      embedder,
      log: print,
    });
    store.setIndexed(commit, new Date());
    print(
      `Indexed ${commit.slice(0, 12)} in ${seconds(started)}: files ${summary.seen} seen, ` +
        `${summary.unchanged} unchanged, ${summary.embedded} embedded, ${summary.removed} removed; ` +
        `chunks ${summary.chunks} embedded (~${summary.tokens} tokens); ` +
        `${summary.secrets} chunks skipped as secrets.`,
    );
  } finally {
    store.close();
  }
}

export interface MainOptions {
  /** The repository; by default the one around the working directory. */
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Where the lines go; by default standard output. Errors go to `console.error`. */
  print?: Print;
}

export async function main(args: string[], options: MainOptions = {}): Promise<number> {
  const print = options.print ?? ((line: string) => process.stdout.write(`${line}\n`));
  const env = options.env ?? process.env;
  const [command = 'index', ...flags] = args;
  // `npm run rag:index --dry-run` (no `--`) gives the flag to npm, which only sets this
  // variable: without the check that run would be a real one, sending the files to Voyage.
  for (const flag of ['dry-run', 'full']) {
    if (env[`npm_config_${flag.replace('-', '_')}`] === 'true' && !flags.includes(`--${flag}`)) {
      console.error(`npm took --${flag} as its own: run \`npm run rag:index -- --${flag}\``);
      return 2;
    }
  }
  const known = new Set(['--full', '--dry-run']);
  if (
    command !== 'index' ||
    flags.some((flag) => !known.has(flag)) ||
    (flags.includes('--full') && flags.includes('--dry-run'))
  ) {
    console.error(USAGE);
    return 2;
  }
  try {
    const root = repositoryRoot(options.cwd);
    if (flags.includes('--dry-run')) dryRun(root, print);
    else await index(root, flags.includes('--full'), env, print);
    return 0;
  } catch (error) {
    console.error(`rag:index: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
