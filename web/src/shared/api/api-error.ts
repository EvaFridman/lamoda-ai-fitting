// What went wrong, for the texts the visitor sees and for Sentry:
// - `http`: the api answered with a non-2xx status;
// - `network`: no answer (refused connection, reset, DNS);
// - `timeout`: no answer within the client's timeout;
// - `schema`: an answer that is not JSON or does not match the schema;
// - `path`: a path refused before any request (H17).
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'schema' | 'path';

interface ApiErrorInit {
  kind: ApiErrorKind;
  // The path template (`/products/:id`): groups failures by route, whatever the ids in the path.
  template: string;
  status?: number;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly template: string;
  readonly status?: number;

  constructor(message: string, { kind, template, status, cause }: ApiErrorInit) {
    super(message, { cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.template = template;
    this.status = status;
  }
}
