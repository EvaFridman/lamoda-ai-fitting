// Which committed files the index reads (spec 0021 plan §3.2, Q7, Q19). Only the files of a
// commit (`git ls-tree`) are looked at, so `.env`, `.rag/`, anything untracked and a staged change
// gitleaks has not seen yet never come in.

import { execFileSync } from 'node:child_process';

export interface TrackedFile {
  path: string;
  /** git's mode: `100644` or `100755` for a regular file, `120000` a symlink, `160000` a submodule. */
  mode: string;
  /** git's blob hash of the content. */
  blobHash: string;
  size: number;
  /** 0, or 1–3 for each side of an unmerged path during a conflict. */
  stage: number;
}

export type SkipReason = 'outside' | 'excluded' | 'unmerged' | 'mode' | 'extension' | 'size';

export interface Selection {
  included: TrackedFile[];
  skipped: { path: string; reason: SkipReason }[];
}

export const MAX_FILE_BYTES = 512 * 1024;

/** `git ls-tree` of a commit in `git ls-files`' shape: a commit's files are never unmerged. */
export function lsTreeArgs(commit: string): string[] {
  return [
    'ls-tree',
    '-r',
    '-z',
    '--format=%(objectmode) %(objectname) %(objectsize) 0 %(path)',
    commit,
  ];
}

// A symlink could point at `.env` or a key outside the repository; only regular files are read.
const REGULAR_MODES = new Set(['100644', '100755']);

const INCLUDED_PREFIXES = [
  'api/src/',
  'api/prisma/',
  'api/test/',
  'api/scripts/',
  'web/src/',
  'web/app/',
  'specs/',
  '.claude/rules/',
  'deploy/',
  '.github/',
  'scripts/',
];

const INCLUDED_FILES = new Set([
  'web/next.config.ts',
  'web/proxy.ts',
  'web/sentry.options.ts',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'README.md',
  'api/README.md',
  'web/README.md',
  '.env.example',
]);

const EXCLUDED_PREFIXES = [
  'api/src/generated/',
  'api/seed-media/',
  '.claude/skills/prisma-',
  '.claude/skills/temporal-developer/',
];

const EXCLUDED_FILES = new Set([
  'api/openapi.json',
  'api/validation-codes.json',
  'web/src/shared/analytics/EVENTS.md',
  'web/src/shared/csp/shell-script-hashes.json',
]);

const EXTENSIONS = new Set([
  'ts',
  'tsx',
  'mts',
  'mjs',
  'cjs',
  'js',
  'json',
  'yml',
  'yaml',
  'md',
  'scss',
  'css',
  'sh',
  'sql',
  'prisma',
  'conf',
  'template',
  'toml',
]);

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function isDockerfile(path: string): boolean {
  return baseName(path) === 'Dockerfile';
}

function isIncluded(path: string): boolean {
  if (INCLUDED_FILES.has(path) || INCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }
  const name = baseName(path);
  return (
    /^web\/instrumentation[^/]*\.ts$/.test(path) ||
    isDockerfile(path) ||
    (name === path && /^docker-compose[^/]*\.yml$/.test(name))
  );
}

function isExcluded(path: string): boolean {
  const name = baseName(path);
  return (
    (name.startsWith('.env') && path !== '.env.example') ||
    name === 'package-lock.json' ||
    name.endsWith('.lock') ||
    EXCLUDED_FILES.has(path) ||
    EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function hasReadableType(path: string): boolean {
  if (isDockerfile(path) || path === '.env.example') return true;
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 && EXTENSIONS.has(name.slice(dot + 1));
}

/**
 * Parses `git ls-files -z --format='%(objectmode) %(objectname) %(objectsize) %(stage) %(path)'`,
 * or `git ls-tree` run with `lsTreeArgs`.
 */
export function parseLsFiles(output: string): TrackedFile[] {
  return output
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => {
      // A submodule has no size: `-`.
      const match = /^(\d{6}) ([0-9a-f]+) (\d+|-) ([0-3]) (.+)$/s.exec(entry);
      if (!match) throw new Error(`Unexpected git ls-files entry: ${JSON.stringify(entry)}`);
      const [, mode, blobHash, size, stage, path] = match as unknown as string[] as [
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      return {
        path,
        mode,
        blobHash,
        size: size === '-' ? 0 : Number(size),
        stage: Number(stage),
      };
    });
}

function skipReason(file: TrackedFile): SkipReason | null {
  if (!isIncluded(file.path)) return 'outside';
  if (isExcluded(file.path)) return 'excluded';
  if (file.stage !== 0) return 'unmerged';
  if (!REGULAR_MODES.has(file.mode)) return 'mode';
  if (!hasReadableType(file.path)) return 'extension';
  if (file.size > MAX_FILE_BYTES) return 'size';
  return null;
}

export function selectFiles(files: TrackedFile[]): Selection {
  const selection: Selection = { included: [], skipped: [] };
  const seen = new Set<string>();
  for (const file of files) {
    // An unmerged path comes once per side; it is skipped, and named once.
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    const reason = skipReason(file);
    if (reason) selection.skipped.push({ path: file.path, reason });
    else selection.included.push(file);
  }
  return selection;
}

/** The files of a commit (by default `HEAD`), never the staged or working tree's ones. */
export function listTrackedFiles(root: string, commit = 'HEAD'): TrackedFile[] {
  const output = execFileSync('git', lsTreeArgs(commit), {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return parseLsFiles(output);
}

/** Parses the output of `git cat-file --batch`: each blob's text by its hash. */
export function parseCatFileBatch(output: Buffer): Map<string, string> {
  const blobs = new Map<string, string>();
  const decoder = new TextDecoder();
  let position = 0;
  while (position < output.length) {
    const newline = output.indexOf(10, position);
    if (newline === -1) throw new Error('Truncated git cat-file output');
    const header = output.subarray(position, newline).toString('utf8');
    const match = /^([0-9a-f]+) blob (\d+)$/.exec(header);
    if (!match) throw new Error(`Unexpected git cat-file header: ${JSON.stringify(header)}`);
    const start = newline + 1;
    const end = start + Number(match[2]);
    if (end >= output.length || output[end] !== 10)
      throw new Error('Truncated git cat-file output');
    blobs.set(match[1]!, decoder.decode(output.subarray(start, end)));
    position = end + 1;
  }
  return blobs;
}

/**
 * The content of blobs by their hashes (`git cat-file`), not the working tree's, so the text,
 * the hash and the chunk ids agree and an uncommitted edit stays out (plan §3.2).
 */
export function readBlobs(root: string, hashes: string[]): Map<string, string> {
  const unique = [...new Set(hashes)];
  if (unique.length === 0) return new Map();
  const output = execFileSync('git', ['cat-file', '--batch'], {
    cwd: root,
    input: `${unique.join('\n')}\n`,
    maxBuffer: 1024 * 1024 * 1024,
  });
  const blobs = parseCatFileBatch(output);
  const missing = unique.find((hash) => !blobs.has(hash));
  if (missing) throw new Error(`git cat-file did not return the blob ${missing}`);
  return blobs;
}

// Defence in depth behind gitleaks: a chunk that looks like it holds a secret is not indexed.
const SECRET_PATTERNS = [
  // Either end of a private key, so a window that cuts it still matches, and a key's body line.
  /-----(BEGIN|END) [A-Z0-9 ]*PRIVATE KEY( BLOCK)?-----/,
  /^\s*["'`]?(?=[A-Za-z+/]*\d)[A-Za-z0-9+/]{60,76}={0,2}["'`]?\s*[,+]?\s*$/,
  // Credentials in an address, and a long value of a variable named as a secret.
  // (a placeholder such as `<password>` or `${PASSWORD}` is not one).
  /:\/\/[^\s/:@]+:(?=[\w.~!*+-]*\d)[\w.~!*+-]{8,}@/,
  /(SECRET|PASSWORD|TOKEN|API_KEY)\w*["']?\s*[=:]\s*["'`]?(?=[\w+/=-]*\d)[\w+/=-]{20,}/i,
  /\bsntry[su]_[A-Za-z0-9_=-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /AGE-SECRET-KEY-1[0-9A-Z]{50,}/,
  /GOCSPX-[A-Za-z0-9_-]{20,}/,
  /\b(sk|pa)-[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_\w{20,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  // A long hex, base64 or base64url run after `=` or `:`; an image digest's `@sha256:` is not one.
  // base64 holds a digit, so a long word is not one; base64url also both cases, so an identifier
  // or a uuid is not one.
  /(?<!@sha256)[=:]\s*["'`]?(?=[A-Za-z+/]*\d)[A-Za-z0-9+/]{40,}={0,2}(?![\w+/=-])/,
  /(?<!@sha256)[=:]\s*["'`]?(?=[\w-]*\d)(?=[\w-]*[a-z])(?=[\w-]*[A-Z])[\w-]{40,}={0,2}(?![\w+/=-])/,
  /(?<!@sha256)[=:]\s*["'`]?[0-9a-fA-F]{32,}(?![0-9a-zA-Z])/,
];

/** The 0-based index of the first line of `text` that looks like a secret, or `null`. */
export function findSecretLine(text: string): number | null {
  const lines = text.split('\n');
  const index = lines.findIndex((line) => SECRET_PATTERNS.some((pattern) => pattern.test(line)));
  return index === -1 ? null : index;
}
