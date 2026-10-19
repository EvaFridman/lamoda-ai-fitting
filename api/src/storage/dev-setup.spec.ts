import {
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketPolicyCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { createBackupBucket, mediaReadPolicy, setUpBucket } from './dev-setup.js';

function stubClient(send = vi.fn().mockResolvedValue({})) {
  return { send, client: { send } as unknown as S3Client };
}

describe('mediaReadPolicy', () => {
  it('allows anyone to read media/ and nothing else', () => {
    const policy = JSON.parse(mediaReadPolicy('my-bucket')) as {
      Statement: { Effect: string; Principal: unknown; Action: string[]; Resource: string[] }[];
    };

    expect(policy.Statement).toHaveLength(1);
    expect(policy.Statement[0]).toMatchObject({
      Effect: 'Allow',
      Principal: '*',
      Action: ['s3:GetObject'],
      Resource: ['arn:aws:s3:::my-bucket/media/*'],
    });
  });

  it('does not open keep/ or tmp/', () => {
    const policy = mediaReadPolicy('my-bucket');

    expect(policy).not.toContain('keep/');
    expect(policy).not.toContain('tmp/');
  });
});

describe('setUpBucket', () => {
  it('sets the media read policy on the bucket', async () => {
    const { client, send } = stubClient();

    await setUpBucket(client, 'my-bucket');

    const command = send.mock.calls
      .map(([c]) => c as unknown)
      .find((c) => c instanceof PutBucketPolicyCommand) as PutBucketPolicyCommand;
    expect(command.input).toEqual({ Bucket: 'my-bucket', Policy: mediaReadPolicy('my-bucket') });
  });

  it('sets one lifecycle rule: tmp/ expires after a day, unfinished uploads are aborted', async () => {
    const { client, send } = stubClient();

    await setUpBucket(client, 'my-bucket');

    const command = send.mock.calls
      .map(([c]) => c as unknown)
      .find((c) => c instanceof PutBucketLifecycleConfigurationCommand) as
      PutBucketLifecycleConfigurationCommand | undefined;
    expect(command?.input.Bucket).toBe('my-bucket');
    const rules = command?.input.LifecycleConfiguration?.Rules ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      Status: 'Enabled',
      Filter: { Prefix: 'tmp/' },
      Expiration: { Days: 1 },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    });
  });

  it('sends the same inputs on a second call', async () => {
    const { client, send } = stubClient();

    await setUpBucket(client, 'my-bucket');
    await setUpBucket(client, 'my-bucket');

    const inputs = send.mock.calls.map(([c]) => (c as { input: unknown }).input);
    expect(inputs).toHaveLength(4);
    expect(inputs.slice(0, 2)).toEqual(inputs.slice(2));
  });

  it('rejects when the storage refuses a command', async () => {
    const { client } = stubClient(vi.fn().mockRejectedValue(new Error('AccessDenied')));

    await expect(setUpBucket(client, 'my-bucket')).rejects.toThrow('AccessDenied');
  });
});

describe('createBackupBucket', () => {
  const owned = new BucketAlreadyOwnedByYou({ message: 'owned', $metadata: {} });
  const exists = new BucketAlreadyExists({ message: 'exists', $metadata: {} });

  it('creates the bucket and sets no policy', async () => {
    const { client, send } = stubClient();

    await createBackupBucket(client, 'backups');

    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0]![0] as unknown;
    expect(command).toBeInstanceOf(CreateBucketCommand);
    expect((command as CreateBucketCommand).input).toEqual({ Bucket: 'backups' });
  });

  it.each([
    ['BucketAlreadyOwnedByYou', owned],
    ['BucketAlreadyExists', exists],
  ])('leaves a bucket that exists (%s)', async (_name, error) => {
    const { client } = stubClient(vi.fn().mockRejectedValue(error));

    await expect(createBackupBucket(client, 'backups')).resolves.toBeUndefined();
  });

  it('rejects on any other error', async () => {
    const { client } = stubClient(vi.fn().mockRejectedValue(new Error('AccessDenied')));

    await expect(createBackupBucket(client, 'backups')).rejects.toThrow('AccessDenied');
  });
});
