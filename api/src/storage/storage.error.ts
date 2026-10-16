// A failed request to the storage, as StorageService throws it (spec 0011 M22). The SDK's own
// error keeps the raw response, whose request header holds the access key id and the object's path
// (a user's id), and fields of the answer's body (`Key`, `Resource`); a log line of it would carry
// them (AC14). This one keeps only what tells the failure apart, and no cause.
export class StorageError extends Error {
  override readonly name = 'StorageError';

  constructor(
    readonly operation: string,
    // The S3 error code (`NoSuchBucket`, `SignatureDoesNotMatch`) or the network error's name.
    readonly code: string,
    readonly status: number | undefined,
    readonly requestId: string | undefined,
  ) {
    super(`Storage ${operation} failed: ${code}${status === undefined ? '' : ` (HTTP ${status})`}`);
  }

  static from(operation: string, error: unknown): StorageError {
    if (!(error instanceof Error)) {
      return new StorageError(operation, 'Unknown', undefined, undefined);
    }
    const metadata = (error as { $metadata?: { httpStatusCode?: unknown; requestId?: unknown } })
      .$metadata;
    const status = metadata?.httpStatusCode;
    const requestId = metadata?.requestId;
    // A network failure is a plain `Error` whose `code` tells it apart (`ECONNREFUSED`, `ENOTFOUND`).
    const systemCode = (error as { code?: unknown }).code;
    const code = typeof systemCode === 'string' ? systemCode : error.name;
    return new StorageError(
      operation,
      // Only a name-like value: anything else could be text of the answer.
      /^\w{1,64}$/.test(code) ? code : 'Unknown',
      typeof status === 'number' ? status : undefined,
      typeof requestId === 'string' && /^[\w.:/+=-]{1,128}$/.test(requestId)
        ? requestId
        : undefined,
    );
  }
}
