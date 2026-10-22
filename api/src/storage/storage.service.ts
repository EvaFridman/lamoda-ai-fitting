import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';

import { isDeletableFolder, isInUserFolder, isUserFileKey, isValidKey } from './keys.js';
import {
  S3_CLIENT,
  S3_SIGNING_CLIENT,
  STORAGE_SETTINGS,
  type StorageSettings,
} from './s3-client.provider.js';
import { StorageError } from './storage.error.js';

// Every file of the bucket is a WebP image (spec 0011 M7: keys end in `.webp`).
const CONTENT_TYPES: ReadonlySet<string> = new Set(['image/webp']);

export interface PutOptions {
  contentType: string;
  cacheControl?: string;
  // Required for a user's file (`keep/…`), which must lie in this user's folder; stored as the
  // object's metadata `x-amz-meta-owner-user-id` for audits and manual cleanup (spec 0011 M7).
  ownerUserId?: string;
  // Stops the request in flight (a write inside a database transaction's time, spec 0019 A54).
  abortSignal?: AbortSignal;
}

// The app's bucket (spec 0011 M1). Keys come from keys.ts; every method refuses any other shape
// before a request. A failed request throws a StorageError (never the SDK's error, M22), so a caller
// (a seed, an activity that retries) sees it and a log line of it holds no key id or path.
@Injectable()
export class StorageService implements OnApplicationShutdown {
  constructor(
    @Inject(STORAGE_SETTINGS) private readonly settings: StorageSettings,
    @Inject(S3_CLIENT) private readonly client: S3Client,
    @Inject(S3_SIGNING_CLIENT) private readonly signingClient: S3Client,
  ) {}

  async put(key: string, body: Uint8Array, options: PutOptions): Promise<void> {
    assertKey(key);
    const { contentType, cacheControl, ownerUserId, abortSignal } = options;
    // A signed link serves the object with this type: HTML or SVG would run in the browser.
    if (!CONTENT_TYPES.has(contentType)) {
      throw new Error('Only WebP images are stored');
    }
    if (ownerUserId === undefined ? isUserFileKey(key) : !isInUserFolder(key, ownerUserId)) {
      throw new Error("A user's file needs its owner, and must lie in the owner's folder");
    }
    await this.request('PutObject', () =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
          Metadata: ownerUserId === undefined ? undefined : { 'owner-user-id': ownerUserId },
        }),
        { abortSignal },
      ),
    );
  }

  async exists(key: string): Promise<boolean> {
    assertKey(key);
    try {
      await this.request('HeadObject', () =>
        this.client.send(new HeadObjectCommand({ Bucket: this.settings.bucket, Key: key })),
      );
      return true;
    } catch (error) {
      // A HEAD answer has no body, so a missing object is only its status.
      if (error instanceof StorageError && error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  // Deletes every object under one user's or one generation's folder (keys.ts: userFolders,
  // generationFolder); returns how many. Repeating it is harmless: an empty folder deletes nothing.
  // Throws if any object is not deleted, so an activity that calls it retries. `abortSignal` (an
  // activity's cancellation) stops the request in flight.
  async deletePrefix(prefix: string, abortSignal?: AbortSignal): Promise<number> {
    if (!isDeletableFolder(prefix)) {
      throw new Error("deletePrefix takes only a user's or a generation's folder");
    }
    let deleted = 0;
    let continuationToken: string | undefined;
    do {
      // At most 1,000 keys a page, the most one DeleteObjects takes.
      const page = await this.request('ListObjectsV2', () =>
        this.client.send(
          new ListObjectsV2Command({
            Bucket: this.settings.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
          { abortSignal },
        ),
      );
      const keys = (page.Contents ?? []).flatMap(({ Key }) => (Key === undefined ? [] : [Key]));
      if (keys.length > 0) {
        const result = await this.request('DeleteObjects', () =>
          this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.settings.bucket,
              Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
            }),
            { abortSignal },
          ),
        );
        const errors = result.Errors ?? [];
        if (errors.length > 0) {
          // Codes only, and only name-like ones: the keys carry user ids.
          const codes = [
            ...new Set(
              errors.map(({ Code }) =>
                Code !== undefined && /^\w{1,64}$/.test(Code) ? Code : 'unknown',
              ),
            ),
          ].join(', ');
          throw new Error(`DeleteObjects failed for ${errors.length} objects (${codes})`);
        }
        deleted += keys.length;
      }
      if (page.IsTruncated === true && page.NextContinuationToken === undefined) {
        // Stopping here would leave files behind and report success.
        throw new Error('ListObjectsV2 answered a truncated page without a continuation token');
      }
      continuationToken = page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
    return deleted;
  }

  // A link that reads the object for S3_SIGNED_URL_TTL_SECONDS (spec 0011 M9), at the public
  // endpoint. Signing is local (an HMAC, no request), so lists sign every row; a link to a missing
  // object answers 404 from the storage.
  async signedUrl(key: string): Promise<string> {
    assertKey(key);
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({ Bucket: this.settings.bucket, Key: key }),
      { expiresIn: this.settings.signedUrlTtlSeconds },
    );
  }

  // Every request goes through here: the SDK's error stays behind (StorageError).
  private async request<Output>(operation: string, send: () => Promise<Output>): Promise<Output> {
    try {
      return await send();
    } catch (error) {
      throw StorageError.from(operation, error);
    }
  }

  // After the HTTP server has closed: onModuleDestroy runs while it still takes requests, as in
  // TemporalClientModule.
  onApplicationShutdown(): void {
    this.client.destroy();
    this.signingClient.destroy();
  }
}

function assertKey(key: string): void {
  if (!isValidKey(key)) {
    throw new Error('Not a valid object key');
  }
}
