import { describe, expect, it } from 'vitest';

import {
  backupStamp,
  backupSuffix,
  dailyDatabaseKey,
  dailyStorageKey,
  isImageTag,
  loggedKey,
  preDeployDatabaseKey,
} from './keys.js';

const SUFFIX = '0123456789abcdef';
const BAD_SUFFIXES = [
  '0123456789abcde',
  '0123456789abcdef0',
  '0123456789ABCDEF',
  '0123456789abcdeg',
  '',
  '0123456789abcd/f',
  '..',
  '../0123456789abc',
  '0123456789abcdef\n',
];

describe('backupStamp', () => {
  it('formats a UTC time without milliseconds', () => {
    expect(backupStamp(new Date('2026-10-19T03:04:05.678Z'))).toBe('2026-10-19T03-04-05Z');
  });

  it('sorts by time', () => {
    const times = [
      '2026-10-19T03:04:05Z',
      '2026-10-19T03:04:06Z',
      '2026-10-19T13:00:00Z',
      '2026-11-01T00:00:00Z',
      '2027-01-01T00:00:00Z',
    ].map((value) => backupStamp(new Date(value)));
    expect([...times].reverse().sort()).toEqual(times);
  });
});

describe('backupSuffix', () => {
  it('is 16 lower-case hex digits', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(backupSuffix()).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('differs between calls', () => {
    const suffixes = new Set(Array.from({ length: 50 }, () => backupSuffix()));
    expect(suffixes.size).toBe(50);
  });

  it('is accepted by the key functions', () => {
    const suffix = backupSuffix();
    const at = new Date('2026-10-19T03:04:05Z');
    expect(dailyDatabaseKey(at, suffix)).toContain(suffix);
    expect(dailyStorageKey(at, suffix)).toContain(suffix);
    expect(preDeployDatabaseKey(at, 'abc1234', suffix)).toContain(suffix);
  });
});

describe('database keys', () => {
  const at = new Date('2026-10-19T03:04:05.678Z');

  it('names a daily copy', () => {
    expect(dailyDatabaseKey(at, SUFFIX)).toBe(
      'daily/2026-10-19T03-04-05Z-0123456789abcdef/database.dump.age',
    );
  });

  it('names a pre-deploy copy with the image tag', () => {
    expect(preDeployDatabaseKey(at, 'abc1234', SUFFIX)).toBe(
      'pre-deploy/2026-10-19T03-04-05Z-abc1234-0123456789abcdef/database.dump.age',
    );
  });

  it.each(['abc123', 'a'.repeat(41), 'ABC1234', 'abc123g', '../abc1234', '', 'abc 1234'])(
    'refuses the tag %j',
    (tag) => {
      expect(() => preDeployDatabaseKey(at, tag, SUFFIX)).toThrow('commit SHA');
    },
  );

  it('checks the tag before the suffix', () => {
    expect(() => preDeployDatabaseKey(at, '../evil', 'bad')).toThrow('commit SHA');
  });

  it('gives two runs at the same second different names', () => {
    expect(dailyDatabaseKey(at, backupSuffix())).not.toBe(dailyDatabaseKey(at, backupSuffix()));
  });

  it('still sorts by time whatever the suffixes are', () => {
    const early = dailyDatabaseKey(new Date('2026-10-19T03:04:05Z'), 'ffffffffffffffff');
    const late = dailyDatabaseKey(new Date('2026-10-19T03:04:06Z'), '0000000000000000');
    expect([late, early].sort()).toEqual([early, late]);
  });
});

describe('dailyStorageKey', () => {
  const at = new Date('2026-10-19T03:04:05.678Z');

  it('names the storage archive by the UTC stamp, in the folder of the database copy', () => {
    expect(dailyStorageKey(at, SUFFIX)).toBe(
      'daily/2026-10-19T03-04-05Z-0123456789abcdef/storage.tar.age',
    );
    expect(dailyStorageKey(at, SUFFIX).split('/').slice(0, 2)[0]).toBe(
      dailyDatabaseKey(at, SUFFIX).split('/')[0],
    );
    expect(dailyStorageKey(at, SUFFIX).split('/')[1]).toBe(
      dailyDatabaseKey(at, SUFFIX).split('/')[1],
    );
  });
});

describe('suffix check', () => {
  const at = new Date('2026-10-19T03:04:05Z');

  it.each(BAD_SUFFIXES)('dailyDatabaseKey refuses the suffix %j', (suffix) => {
    expect(() => dailyDatabaseKey(at, suffix)).toThrow('The suffix must be 16 hex digits');
  });

  it.each(BAD_SUFFIXES)('dailyStorageKey refuses the suffix %j', (suffix) => {
    expect(() => dailyStorageKey(at, suffix)).toThrow('The suffix must be 16 hex digits');
  });

  it.each(BAD_SUFFIXES)('preDeployDatabaseKey refuses the suffix %j', (suffix) => {
    expect(() => preDeployDatabaseKey(at, 'abc1234', suffix)).toThrow(
      'The suffix must be 16 hex digits',
    );
  });
});

describe('loggedKey', () => {
  const at = new Date('2026-10-19T01:00:00Z');
  const sha40 = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

  it('hides the suffix of a daily database copy', () => {
    expect(loggedKey(dailyDatabaseKey(at, SUFFIX))).toBe(
      'daily/2026-10-19T01-00-00Z-<suffix>/database.dump.age',
    );
  });

  it('hides the suffix of a daily storage copy', () => {
    expect(loggedKey(dailyStorageKey(at, SUFFIX))).toBe(
      'daily/2026-10-19T01-00-00Z-<suffix>/storage.tar.age',
    );
  });

  it.each(['abc1234', sha40])('keeps a pre-deploy tag of %s and hides only the suffix', (tag) => {
    const logged = loggedKey(preDeployDatabaseKey(at, tag, SUFFIX));
    expect(logged).toBe(`pre-deploy/2026-10-19T01-00-00Z-${tag}-<suffix>/database.dump.age`);
    expect(logged).not.toContain(SUFFIX);
  });

  it('leaves no 16-hex run of the suffix for a random one', () => {
    const suffix = backupSuffix();
    for (const key of [
      dailyDatabaseKey(at, suffix),
      dailyStorageKey(at, suffix),
      preDeployDatabaseKey(at, 'abc1234', suffix),
    ]) {
      expect(loggedKey(key)).not.toContain(suffix);
      expect(loggedKey(key)).toContain('-<suffix>/');
    }
  });

  it('leaves a key with no suffix as it is', () => {
    expect(loggedKey('media/a.jpg')).toBe('media/a.jpg');
  });
});

describe('isImageTag', () => {
  it.each(['abc1234', 'a'.repeat(40), '0123456789abcdef'])('accepts %s', (tag) => {
    expect(isImageTag(tag)).toBe(true);
  });

  it.each(['a'.repeat(6), 'a'.repeat(41), 'ABCDEF1', 'zzzzzzz', 'abc1234\n'])(
    'refuses %j',
    (tag) => {
      expect(isImageTag(tag)).toBe(false);
    },
  );
});
