// The names of the copies in the backup bucket (spec 0012 plan §2). The first segment tells a
// nightly copy from one made before migrations; both expire by the bucket's rule (P2, P3).

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

export function dailyDatabaseKey(at: Date): string {
  return `daily/${backupStamp(at)}/database.dump.age`;
}

// The app bucket's copy of the same night (plan §3).
export function dailyStorageKey(at: Date): string {
  return `daily/${backupStamp(at)}/storage.tar.age`;
}

// A tag that is not a SHA would put anything into the key; `--pre-deploy` refuses it before
// dumping.
export function preDeployDatabaseKey(at: Date, tag: string): string {
  if (!isImageTag(tag)) {
    throw new Error('The image tag must be a commit SHA (7 to 40 hex digits)');
  }
  return `pre-deploy/${backupStamp(at)}-${tag}/database.dump.age`;
}
