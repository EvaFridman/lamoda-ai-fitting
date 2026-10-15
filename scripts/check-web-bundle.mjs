// Fails when the browser bundle of web holds a server secret's name (spec 0007 AC6, plan §10): any
// file under `web/.next/static` that contains `x-proxy-secret` (any case), the header `apiFetch`
// sends, or `PROXY_SECRET`, its env name. Importing `server-only` from a client component already
// fails `next build`; this catches the rest, e.g. a client file that copies the header by hand.
// Root `verify` runs it after `build`. A missing or empty directory fails too, so the check never
// passes on a build that did not happen, and so does a symbolic link: Next makes none there, and a
// link would be skipped by the search.
//
// Usage: node scripts/check-web-bundle.mjs [directory]   (default: web/.next/static)

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DIR = path.join(import.meta.dirname, '..', 'web', '.next', 'static');
const PATTERNS = [/x-proxy-secret/i, /PROXY_SECRET/];

/** Every file under a directory, recursively. Throws on a symbolic link. */
function listFiles(dir) {
  const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
  const link = entries.find((entry) => entry.isSymbolicLink());
  if (link) {
    throw new Error(`${path.join(link.parentPath, link.name)} is a symbolic link, not searched`);
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/**
 * The files under `dir` that hold a server secret's name, with the text found. Throws when `dir`
 * is missing, holds no files or holds a symbolic link.
 */
export function findLeaks(dir) {
  if (!fs.existsSync(dir)) throw new Error(`${dir} does not exist: build web first`);
  const files = listFiles(dir);
  if (files.length === 0) throw new Error(`${dir} holds no files: build web first`);
  const leaks = [];
  for (const file of files) {
    // latin1 maps every byte to one character, so binary files (fonts) are searched as well.
    const text = fs.readFileSync(file, 'latin1');
    for (const pattern of PATTERNS) {
      const match = pattern.exec(text);
      if (match) leaks.push({ file, found: match[0] });
    }
  }
  return leaks;
}

if (import.meta.main) {
  const dir = path.resolve(process.argv[2] ?? DEFAULT_DIR);
  let leaks;
  try {
    leaks = findLeaks(dir);
  } catch (error) {
    console.error(`check-web-bundle: ${error.message}`);
    process.exit(1);
  }
  if (leaks.length > 0) {
    console.error('check-web-bundle: server secret names in the browser bundle:');
    for (const { file, found } of leaks) {
      console.error(`  ${path.relative(process.cwd(), file)}: ${found}`);
    }
    process.exit(1);
  }
  process.stdout.write(
    `check-web-bundle: no server secret names under ${path.relative(process.cwd(), dir)}\n`,
  );
}
