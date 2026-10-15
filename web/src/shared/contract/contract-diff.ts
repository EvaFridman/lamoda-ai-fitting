import { z } from 'zod';

// An OpenAPI 3.0 document, as far as the comparison reads it.
export interface OpenApiDocument {
  components: { schemas: Record<string, unknown> };
  paths?: Record<string, unknown>;
}

// A route's JSON response, e.g. `{ method: 'get', path: '/products', status: '200' }`: how a list
// is checked, since its `{ items, total }` wrapper is not a component.
export interface OpenApiResponse {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  // As the document writes it, with `{id}` params.
  path: string;
  status: string;
}

export type ContractCheck = {
  // How a failure names the web schema, e.g. `productListItemSchema`.
  name: string;
  schema: z.ZodType;
} & (
  | {
      // A key of `components.schemas`, e.g. `ProductListItemDto`.
      component: string;
    }
  | { response: OpenApiResponse }
);

// One shape both sides are reduced to. Only what a response's reader depends on is kept: property
// names, required, types, formats, nullable and enum values. Limits (minimum, maxLength, pattern),
// examples and descriptions are not compared; neither is `integer` against `number`: an integer is
// a narrower number, like a limit, and the api's DTOs do not state it consistently.
type Shape =
  | { kind: 'object'; nullable: boolean; properties: Map<string, Shape>; required: Set<string> }
  | { kind: 'array'; nullable: boolean; items: Shape }
  | {
      kind: 'scalar';
      nullable: boolean;
      type: string;
      format: string | undefined;
      enum: string[] | undefined;
    };

type Json = Record<string, unknown>;

// Differences between a zod schema (its input, the JSON it parses) and an OpenAPI
// component or route response, following `$ref`s on both sides. Each line names the schema, the
// component or response and the field; an empty list is a match.
export function contractDiff(document: OpenApiDocument, check: ContractCheck): string[] {
  const target =
    'component' in check
      ? check.component
      : `${check.response.method.toUpperCase()} ${check.response.path} ${check.response.status}`;
  const label = `${check.name} ↔ ${target}`;
  const component =
    'component' in check
      ? document.components.schemas[check.component]
      : responseSchema(document, check.response);
  if (component === undefined) {
    return [
      `${label}: no ${'component' in check ? 'component' : 'JSON response'} ${target} in the OpenAPI document`,
    ];
  }
  try {
    // The input side: the api's JSON is what the schema parses (H19). Throws on what JSON Schema
    // cannot state (z.coerce.date()): reported as a difference.
    const web = z.toJSONSchema(check.schema, { io: 'input' }) as Json;
    const diffs = forbidden(check.schema, web);
    compare(
      toShape(web, web, '#/$defs/', 'web'),
      toShape(component as Json, document as unknown as Json, '#/components/schemas/', 'api'),
      '',
      diffs,
    );
    return diffs.map((diff) => `${label}: ${diff}`);
  } catch (error) {
    return [`${label}: ${error instanceof Error ? error.message : String(error)}`];
  }
}

// What a response schema must not hold (H19): a transform (data stays plain JSON for the
// handoff, plan §4), which only the output side refuses to state, and `.default()` or `.catch()`,
// which zod writes as `default` (a `.catch()` would hide an unknown enum value, H13).
function forbidden(schema: z.ZodType, web: Json): string[] {
  const diffs: string[] = [];
  try {
    z.toJSONSchema(schema, { io: 'output' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diffs.push(`(root): ${/transform/i.test(message) ? 'a transform in web' : message} (H19)`);
  }
  const visit = (node: unknown, field: string): void => {
    if (node === null || typeof node !== 'object') {
      return;
    }
    const json = node as Json;
    if ('default' in json) {
      diffs.push(`${field === '' ? '(root)' : field}: .default() or .catch() in web (H19)`);
    }
    for (const [name, child] of Object.entries((json.properties ?? {}) as Json)) {
      visit(child, field === '' ? name : `${field}.${name}`);
    }
    visit(json.items, `${field}[]`);
    for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
      for (const child of (json[key] ?? []) as unknown[]) {
        visit(child, field);
      }
    }
  };
  visit(web, '');
  return diffs;
}

function responseSchema(document: OpenApiDocument, response: OpenApiResponse): unknown {
  const item = document.paths?.[response.path] as Json | undefined;
  const operation = item?.[response.method] as Json | undefined;
  const answer = (operation?.responses as Json | undefined)?.[response.status] as Json | undefined;
  const json = (answer?.content as Json | undefined)?.['application/json'] as Json | undefined;
  return json?.schema;
}

function compare(web: Shape, api: Shape, field: string, diffs: string[]): void {
  const at = field === '' ? '(root)' : field;
  if (web.kind !== api.kind) {
    diffs.push(`${at}: web has ${describe(web)}, api has ${describe(api)}`);
    return;
  }
  if (web.nullable !== api.nullable) {
    diffs.push(
      `${at}: ${api.nullable ? 'nullable in api, not in web' : 'nullable in web, not in api'}`,
    );
  }
  if (web.kind === 'scalar' && api.kind === 'scalar') {
    if (web.type !== api.type || web.format !== api.format) {
      diffs.push(`${at}: web has ${describe(web)}, api has ${describe(api)}`);
    }
    compareEnums(web.enum, api.enum, at, diffs);
  } else if (web.kind === 'array' && api.kind === 'array') {
    compare(web.items, api.items, `${field}[]`, diffs);
  } else if (web.kind === 'object' && api.kind === 'object') {
    const names = new Set([...api.properties.keys(), ...web.properties.keys()]);
    for (const name of names) {
      const path = field === '' ? name : `${field}.${name}`;
      const webProperty = web.properties.get(name);
      const apiProperty = api.properties.get(name);
      if (webProperty === undefined) {
        diffs.push(`${path}: in api, missing in web`);
      } else if (apiProperty === undefined) {
        diffs.push(`${path}: in web, not in api`);
      } else {
        if (web.required.has(name) !== api.required.has(name)) {
          diffs.push(
            `${path}: ${api.required.has(name) ? 'required in api, optional in web' : 'optional in api, required in web'}`,
          );
        }
        compare(webProperty, apiProperty, path, diffs);
      }
    }
  }
}

function compareEnums(
  web: string[] | undefined,
  api: string[] | undefined,
  at: string,
  diffs: string[],
): void {
  if (web === undefined && api === undefined) {
    return;
  }
  if (web === undefined || api === undefined) {
    diffs.push(
      `${at}: ${api === undefined ? 'enum in web, not in api' : 'enum in api, not in web'}`,
    );
    return;
  }
  const missing = api.filter((value) => !web.includes(value));
  const extra = web.filter((value) => !api.includes(value));
  if (missing.length > 0) {
    diffs.push(`${at}: enum values missing in web: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    diffs.push(`${at}: enum values not in api: ${extra.join(', ')}`);
  }
}

function describe(shape: Shape): string {
  if (shape.kind !== 'scalar') {
    return shape.kind;
  }
  return shape.format === undefined ? shape.type : `${shape.type} (${shape.format})`;
}

// Reduces a JSON Schema node (zod's draft 2020-12 or OpenAPI 3.0) to a Shape. `refPrefix` is where
// that side's `$ref`s point (`#/$defs/`, `#/components/schemas/`); `#` is zod's root.
function toShape(node: Json, root: Json, refPrefix: string, side: string, depth = 0): Shape {
  if (depth > 64) {
    throw new Error(`${side} schema is recursive; the check does not follow cycles`);
  }
  const next = (child: Json): Shape => toShape(child, root, refPrefix, side, depth + 1);

  if (typeof node.$ref === 'string') {
    return withNullable(next(resolve(node.$ref, root, refPrefix, side)), node.nullable === true);
  }
  // zod: `X.nullable()` is `anyOf: [X, { type: 'null' }]`.
  const variants = (node.anyOf ?? node.oneOf) as Json[] | undefined;
  if (variants !== undefined) {
    const others = variants.filter((variant) => variant.type !== 'null');
    if (others.length !== 1) {
      throw new Error(`${side} schema has a union the check does not compare`);
    }
    return withNullable(
      next(others[0] as Json),
      others.length < variants.length || node.nullable === true,
    );
  }
  // OpenAPI from Nest: a nullable or described `$ref` is `allOf: [{ $ref }]` with siblings.
  if (Array.isArray(node.allOf)) {
    if (node.allOf.length !== 1) {
      throw new Error(`${side} schema has an allOf of several schemas`);
    }
    return withNullable(next(node.allOf[0] as Json), node.nullable === true);
  }

  const nullable = node.nullable === true;
  const type = Array.isArray(node.type)
    ? withoutNull(node.type as string[], side)
    : (node.type as string | undefined);
  const typeNullable = Array.isArray(node.type) && (node.type as string[]).includes('null');

  if (type === 'object') {
    const properties = new Map<string, Shape>();
    for (const [name, child] of Object.entries((node.properties ?? {}) as Record<string, Json>)) {
      properties.set(name, next(child));
    }
    return {
      kind: 'object',
      nullable: nullable || typeNullable,
      properties,
      required: new Set((node.required ?? []) as string[]),
    };
  }
  if (type === 'array') {
    return { kind: 'array', nullable: nullable || typeNullable, items: next(node.items as Json) };
  }
  if (type === 'string' || type === 'number' || type === 'integer' || type === 'boolean') {
    // zod: `z.literal('x')` is `const: 'x'`, an enum of one value.
    const values = Array.isArray(node.enum)
      ? (node.enum as unknown[])
      : 'const' in node
        ? [node.const]
        : undefined;
    return {
      kind: 'scalar',
      nullable: nullable || typeNullable || (values?.includes(null) ?? false),
      type: type === 'integer' ? 'number' : type,
      format: typeof node.format === 'string' ? node.format : undefined,
      enum: values?.filter((value) => value !== null).map(String),
    };
  }
  throw new Error(`${side} schema has a node the check does not compare: ${JSON.stringify(node)}`);
}

function withNullable(shape: Shape, nullable: boolean): Shape {
  return nullable ? { ...shape, nullable: true } : shape;
}

function withoutNull(types: string[], side: string): string {
  const others = types.filter((type) => type !== 'null');
  if (others.length !== 1) {
    throw new Error(`${side} schema has several types: ${types.join(', ')}`);
  }
  return others[0] as string;
}

function resolve(ref: string, root: Json, refPrefix: string, side: string): Json {
  if (ref === '#') {
    return root;
  }
  const container = refPrefix === '#/$defs/' ? root.$defs : (root.components as Json).schemas;
  const target =
    ref.startsWith(refPrefix) && container !== undefined
      ? (container as Record<string, Json>)[ref.slice(refPrefix.length)]
      : undefined;
  if (target === undefined) {
    throw new Error(`${side} schema has an unknown $ref ${ref}`);
  }
  return target;
}
