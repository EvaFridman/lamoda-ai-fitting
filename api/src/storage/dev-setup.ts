import {
  PutBucketLifecycleConfigurationCommand,
  PutBucketPolicyCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

// The local and the test emulator's counterpart of what the owner sets once in Timeweb's panel
// (deploy/README.md, spec 0011 M14). Each call writes the same rules, so a second run changes
// nothing.

// Anyone may read media/, which is fine on localhost (M15); everything else needs a key or a signed
// link. Not production's policy: there only the server's address reads media/ (M15), so this one is
// never a template for the panel.
export function mediaReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'PublicReadMedia',
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/media/*`],
      },
    ],
  });
}

export async function setUpBucket(client: S3Client, bucket: string): Promise<void> {
  await client.send(
    new PutBucketPolicyCommand({ Bucket: bucket, Policy: mediaReadPolicy(bucket) }),
  );
  // Unfinished uploads under tmp/ go after a day (M7, AC11); no other prefix expires (M4).
  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'tmp-expires-after-a-day',
            Status: 'Enabled',
            Filter: { Prefix: 'tmp/' },
            Expiration: { Days: 1 },
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
          },
        ],
      },
    }),
  );
}
