import { describe, expect, it } from 'vitest';

import {
  backupStamp,
  dailyDatabaseKey,
  dailyStorageKey,
  isImageTag,
  preDeployDatabaseKey,
} from './keys.js';

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

describe('database keys', () => {
  const at = new Date('2026-10-19T03:04:05.678Z');

  it('names a daily copy', () => {
    expect(dailyDatabaseKey(at)).toBe('daily/2026-10-19T03-04-05Z/database.dump.age');
  });

  it('names a pre-deploy copy with the image tag', () => {
    expect(preDeployDatabaseKey(at, 'abc1234')).toBe(
      'pre-deploy/2026-10-19T03-04-05Z-abc1234/database.dump.age',
    );
  });

  it.each(['abc123', 'a'.repeat(41), 'ABC1234', 'abc123g', '../abc1234', '', 'abc 1234'])(
    'refuses the tag %j',
    (tag) => {
      expect(() => preDeployDatabaseKey(at, tag)).toThrow('commit SHA');
    },
  );
});

describe('dailyStorageKey', () => {
  const at = new Date('2026-10-19T03:04:05.678Z');

  it('names the storage archive by the UTC stamp, next to the database copy', () => {
    expect(dailyStorageKey(at)).toBe('daily/2026-10-19T03-04-05Z/storage.tar.age');
    expect(dailyStorageKey(at).split('/').slice(0, 2)).toEqual(
      dailyDatabaseKey(at).split('/').slice(0, 2),
    );
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
