import { ApiError } from './api-error';

declare const apiPathBrand: unique symbol;

// A path to call the api with, made only by `buildPath`: both clients take nothing else, so a
// string from input never becomes a path unencoded.
export interface ApiPath {
  // `/products/a%2Fb?page=2`, relative to the api's base.
  readonly path: string;
  // `/products/:id`, without the query.
  readonly template: string;
  readonly [apiPathBrand]: true;
}

type QueryValue = string | number | boolean;

// Absent values (`undefined`, `null`) are left out; an array becomes repeated keys.
export type ApiQuery = Record<string, QueryValue | readonly QueryValue[] | null | undefined>;

// The names of the `:name` params of a template: `'/products/:id'` → `'id'`.
type ParamNames<Template extends string> = Template extends `${string}:${infer Rest}`
  ? Rest extends `${infer Name}/${infer Tail}`
    ? Name | ParamNames<Tail>
    : Rest
  : never;

type BuildPathArgs<Template extends string> = [ParamNames<Template>] extends [never]
  ? [params?: Record<string, never>, query?: ApiQuery]
  : [params: Record<ParamNames<Template>, string | number>, query?: ApiQuery];

const PARAM = /:([A-Za-z_]\w*)/g;

// One leading `/`, no second one, no backslash (URL parsing reads it as `/`), no tab or newline
// (URL parsing drops them, so `/\t/host` would become `//host`), no query or fragment.
const TEMPLATE = /^\/(?![/\\])[^?#\\\t\n\r]*$/;

// A `:` only as a whole `:name` segment, so the types (`ParamNames`) and `PARAM` read the same names.
const SEGMENT = /^(?::[A-Za-z_]\w*|[^:]*)$/;

function refuse(template: string, message: string): never {
  throw new ApiError(message, { kind: 'path', template });
}

// A value becomes exactly one segment: `encodeURIComponent` encodes `/`, `?`, `#` and `%`, but
// leaves `.` alone, and URL parsing treats `.`, `..` and `%2E%2E` as moves up the path.
function segment(template: string, name: string, value: string | number | undefined): string {
  if (value === undefined) refuse(template, `path param :${name} has no value`);
  const text = String(value);
  if (text === '' || text === '.' || text === '..') {
    refuse(template, `path param :${name} is empty, . or ..`);
  }
  try {
    return encodeURIComponent(text);
  } catch {
    // A lone surrogate, which has no UTF-8 form: input, not a bug, so refused like the rest.
    return refuse(template, `path param :${name} is not well-formed unicode`);
  }
}

function queryString(query: ApiQuery | undefined): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, String(item));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// `buildPath('/products/:id', { id }, { page: 2 })`. The template is a literal from the code; the
// params and the query may come from input.
export function buildPath<Template extends string>(
  template: Template,
  ...[params, query]: BuildPathArgs<Template>
): ApiPath {
  if (!TEMPLATE.test(template)) {
    refuse(
      template,
      'path template must start with a single / and have no ?, #, \\, tab or newline',
    );
  }
  if (!template.split('/').every((part) => SEGMENT.test(part))) {
    refuse(template, 'path template may have : only in a whole :name segment');
  }
  const values = (params ?? {}) as Record<string, string | number | undefined>;
  const path = template.replace(PARAM, (_match, name: string) =>
    segment(template, name, Object.hasOwn(values, name) ? values[name] : undefined),
  );
  // The brand exists only in types: this is the one place that makes an ApiPath.
  return { path: path + queryString(query), template } as unknown as ApiPath;
}
