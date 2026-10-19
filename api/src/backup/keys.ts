import { randomBytes } from 'node:crypto';

// The names of the copies in the backup bucket (spec 0012 plan §2). The first segment tells a
// nightly copy from one made before migrations; both expire by the bucket's rule (P2, P3). Each
// run's folder ends in a random suffix (P27), never logged: the write key cannot list the bucket,
// so a leaked key cannot find a copy to overwrite, only guess.

const SUFFIX = /^[0-9a-f]{16}$/;

// 64 random bits as 16 hex digits, one per run.
export function backupSuffix(): string {
  return randomBytes(8).toString('hex');
}

function checkSuffix(suffix: string): void {
  if (!SUFFIX.test(suffix)) throw new Error('The suffix must be 16 hex digits');
}

// A copy's key as log lines show it, the suffix hidden: the job's log stays on the server, and the
// copy before migrations is logged into the deploy's log on GitHub (P27).
export function loggedKey(key: string): string {
  return key.replace(/-[0-9a-f]{16}\//, '-<suffix>/');
}

// `YYYY-MM-DDTHH-mm-ssZ` in UTC: names never repeat (one run at a time) and sort by time.
export function backupStamp(at: Date): string {
  return at
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll(':', '-');
}

// The deploy's image tags are commit SHAs.
const IMAGE_TAG = /^[0-9a-f]{7,40}$/;

export function isImageTag(tag: string): boolean {
  return IMAGE_TAG.test(tag);
}

export function dailyDatabaseKey(at: Date, suffix: string): string {
  checkSuffix(suffix);
  return `daily/${backupStamp(at)}-${suffix}/database.dump.age`;
}

// The app bucket's copy of the same night (plan §3), in the same folder: the same suffix.
export function dailyStorageKey(at: Date, suffix: string): string {
  checkSuffix(suffix);
  return `daily/${backupStamp(at)}-${suffix}/storage.tar.age`;
}

// A tag that is not a SHA would put anything into the key; `--pre-deploy` refuses it before
// dumping.
export function preDeployDatabaseKey(at: Date, tag: string, suffix: string): string {
  if (!isImageTag(tag)) {
    throw new Error('The image tag must be a commit SHA (7 to 40 hex digits)');
  }
  checkSuffix(suffix);
  return `pre-deploy/${backupStamp(at)}-${tag}-${suffix}/database.dump.age`;
}
