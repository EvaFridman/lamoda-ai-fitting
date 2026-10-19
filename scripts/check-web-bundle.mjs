// Fails when the browser bundle of web holds a server secret's name (spec 0007 AC6, plan §10): any
// file under `web/.next/static` that contains `x-proxy-secret` (any case), the header `apiFetch`
// sends, or `PROXY_SECRET`, its env name, or the env names of the storage keys, `S3_ACCESS_KEY_ID`
// and `S3_SECRET_ACCESS_KEY` (spec 0011 AC14, plan §1), or the auth secrets' names
// `BETTER_AUTH_SECRET` and `GOOGLE_CLIENT_SECRET` (spec 0013 plan §8), except Better Auth's env
// getter (`ALLOWED`, N53), or the backup job's four
// `BACKUP_{READ,WRITE}_{ACCESS_KEY_ID,SECRET_ACCESS_KEY}` (spec 0012 P25). Importing `server-only` from
// a client component already fails `next build`; this catches the rest, e.g. a client file that
// copies the header by hand.
// Root `verify` runs it after `build`. A missing or empty directory fails too, so the check never
// passes on a build that did not happen, and so does a symbolic link: Next makes none there, and a
// link would be skipped by the search.
//
// Usage: node scripts/check-web-bundle.mjs [directory]   (default: web/.next/static)

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DIR = path.join(import.meta.dirname, '..', 'web', '.next', 'static');
const PATTERNS = [
  /x-proxy-secret/i,
  /PROXY_SECRET/,
  /S3_ACCESS_KEY_ID/,
  /S3_SECRET_ACCESS_KEY/,
  /BETTER_AUTH_SECRET/,
  /GOOGLE_CLIENT_SECRET/,
  /BACKUP_READ_ACCESS_KEY_ID/,
  /BACKUP_READ_SECRET_ACCESS_KEY/,
  /BACKUP_WRITE_ACCESS_KEY_ID/,
  /BACKUP_WRITE_SECRET_ACCESS_KEY/,
];

// The one place a name may stand, cut out before the search (spec 0013 N53): Better Auth's browser
// client imports its shared env module (`@better-auth/core/env`), whose minified getter reads
// `BETTER_AUTH_SECRET` from the environment, empty in a browser. Exactly that shape, so the name
// anywhere else, or that getter returning anything but the environment's value, still fails.
const ALLOWED = [/get BETTER_AUTH_SECRET\(\)\{return [\w$]+\("BETTER_AUTH_SECRET"\)\}/g];

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
    const text = ALLOWED.reduce(
      (rest, allowed) => rest.replace(allowed, ''),
      fs.readFileSync(file, 'latin1'),
    );
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
