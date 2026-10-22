// Fails when a page shell `next build` prerendered holds an inline script the Content Security
// Policy would block (spec 0014 plan §5, O112). `cacheComponents` prerenders each page's static
// shell at build time, when there is no request and so no nonce: its inline scripts run only by a
// hash in the policy's list, `web/src/shared/csp/shell-script-hashes.json`. Today that is React's
// one `$RT` timing script; a React or Next update that adds or changes one fails here instead of in
// visitors' consoles. Scripts with `src` load from the site's own origin ('self'), scripts with a
// `nonce` attribute already carry one.
// `_global-error.html` is skipped: a page made entirely at build time, whose inline scripts hold
// that build's data, so no fixed list of hashes covers them.
// Root `verify` runs it after `build`. A missing directory or one with no shell fails too, so the
// check never passes on a build that did not happen.
//
// Usage: node scripts/check-web-shells.mjs [directory]   (default: web/.next/server/app)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DIR = path.join(import.meta.dirname, '..', 'web', '.next', 'server', 'app');
const HASHES_FILE = path.join(
  import.meta.dirname,
  '..',
  'web',
  'src',
  'shared',
  'csp',
  'shell-script-hashes.json',
);
const SKIPPED = new Set(['_global-error.html']);
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
// A `src` or `nonce` attribute with a value: an empty nonce matches no policy, and `data-src` is
// another attribute.
const LOADED_OR_NONCED = /(?:^|\s)(?:src|nonce)\s*=\s*(?:"[^"]+"|'[^']+'|[^\s"'>]+)/i;

/** A script's hash as a CSP source names it, without the quotes. */
export function scriptHash(text) {
  return `sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}`;
}

/**
 * The inline scripts without a nonce whose hash is not in `allowed`, per shell under `dir`. Throws
 * when `dir` is missing or holds no shell.
 */
export function findBlockedScripts(dir, allowed) {
  if (!fs.existsSync(dir)) throw new Error(`${dir} does not exist: build web first`);
  const shells = fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html') && !SKIPPED.has(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
  if (shells.length === 0) throw new Error(`${dir} holds no page shell: build web first`);
  const blocked = [];
  for (const file of shells) {
    for (const [, attributes, text] of fs.readFileSync(file, 'utf8').matchAll(SCRIPT)) {
      if (LOADED_OR_NONCED.test(attributes)) continue;
      const hash = scriptHash(text);
      if (!allowed.includes(hash)) blocked.push({ file, hash, text: text.slice(0, 80) });
    }
  }
  return blocked;
}

if (import.meta.main) {
  const dir = path.resolve(process.argv[2] ?? DEFAULT_DIR);
  let blocked;
  try {
    blocked = findBlockedScripts(dir, JSON.parse(fs.readFileSync(HASHES_FILE, 'utf8')));
  } catch (error) {
    console.error(`check-web-shells: ${error.message}`);
    process.exit(1);
  }
  if (blocked.length > 0) {
    console.error(
      `check-web-shells: inline scripts the policy would block (hashes go into ${path.relative(process.cwd(), HASHES_FILE)} only after a review of the script):`,
    );
    for (const { file, hash, text } of blocked) {
      console.error(`  ${path.relative(process.cwd(), file)}: ${hash} ${text}`);
    }
    process.exit(1);
  }
  process.stdout.write(
    `check-web-shells: every inline script of the shells under ${path.relative(process.cwd(), dir)} is allowed\n`,
  );
}
