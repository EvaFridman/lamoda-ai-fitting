import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { contractDiff, type OpenApiDocument, type OpenApiResponse } from './contract-diff';

type Json = Record<string, unknown>;

function documentOf(schemas: Record<string, Json>): OpenApiDocument {
  return { components: { schemas } };
}

function object(properties: Record<string, Json>, required: string[] = Object.keys(properties)) {
  return { type: 'object', properties, required };
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const NAME = 'testSchema';
const COMPONENT = 'TestDto';

function diff(schema: z.ZodType, component: Json, others: Record<string, Json> = {}): string[] {
  return contractDiff(documentOf({ [COMPONENT]: component, ...others }), {
    name: NAME,
    schema,
    component: COMPONENT,
  });
}

const prefix = `${NAME} ↔ ${COMPONENT}: `;

describe('contractDiff matches', () => {
  it('a flat object', () => {
    const schema = z.object({ id: z.string(), count: z.number(), on: z.boolean() });
    const component = object({
      id: { type: 'string' },
      count: { type: 'number' },
      on: { type: 'boolean' },
    });
    expect(diff(schema, component)).toEqual([]);
  });

  it('nested objects through $ref', () => {
    const schema = z.object({ brand: z.object({ name: z.string() }) });
    const component = object({ brand: ref('BrandDto') });
    expect(diff(schema, component, { BrandDto: object({ name: { type: 'string' } }) })).toEqual([]);
  });

  it('arrays of $ref', () => {
    const schema = z.object({ items: z.array(z.object({ name: z.string() })) });
    const component = object({ items: { type: 'array', items: ref('ItemDto') } });
    expect(diff(schema, component, { ItemDto: object({ name: { type: 'string' } }) })).toEqual([]);
  });

  it('a nullable $ref (allOf + nullable) against a nullable zod object', () => {
    const schema = z.object({ brand: z.object({ name: z.string() }).nullable() });
    const component = object({
      brand: { allOf: [ref('BrandDto')], nullable: true, description: 'The brand' },
    });
    expect(diff(schema, component, { BrandDto: object({ name: { type: 'string' } }) })).toEqual([]);
  });

  it('a nullable enum $ref against z.enum().nullable()', () => {
    const schema = z.object({ gender: z.enum(['men', 'women']).nullable() });
    const component = object({
      gender: { allOf: [ref('Gender')], nullable: true },
    });
    expect(diff(schema, component, { Gender: { type: 'string', enum: ['men', 'women'] } })).toEqual(
      [],
    );
  });

  it('a plain enum $ref, whatever the order of values', () => {
    const schema = z.object({ gender: z.enum(['women', 'men']) });
    const component = object({ gender: ref('Gender') });
    expect(diff(schema, component, { Gender: { type: 'string', enum: ['men', 'women'] } })).toEqual(
      [],
    );
  });

  it('an enum behind allOf without nullable', () => {
    const schema = z.object({ gender: z.enum(['men', 'women']) });
    const component = object({ gender: { allOf: [ref('Gender')], description: 'd' } });
    expect(diff(schema, component, { Gender: { type: 'string', enum: ['men', 'women'] } })).toEqual(
      [],
    );
  });

  it('z.int() against the api number (deliberate)', () => {
    expect(diff(z.object({ n: z.int() }), object({ n: { type: 'number' } }))).toEqual([]);
  });

  it('matching formats', () => {
    const schema = z.object({
      id: z.uuid(),
      at: z.iso.datetime(),
      day: z.iso.date(),
      link: z.url(),
    });
    const component = object({
      id: { type: 'string', format: 'uuid' },
      at: { type: 'string', format: 'date-time' },
      day: { type: 'string', format: 'date' },
      link: { type: 'string', format: 'uri' },
    });
    expect(diff(schema, component)).toEqual([]);
  });

  it('z.literal against an api enum of the same single value', () => {
    const schema = z.object({ kind: z.literal('x') });
    expect(diff(schema, object({ kind: { type: 'string', enum: ['x'] } }))).toEqual([]);
  });

  it('a clean schema gives no forbidden lines', () => {
    const schema = z.object({
      a: z.string().nullable(),
      b: z.array(z.object({ c: z.enum(['x', 'y']).optional() })),
    });
    const component = object({
      a: { type: 'string', nullable: true },
      b: {
        type: 'array',
        items: object({ c: { type: 'string', enum: ['x', 'y'] } }, []),
      },
    });
    expect(diff(schema, component)).toEqual([]);
  });

  it('optional fields on both sides', () => {
    const schema = z.object({ a: z.string().optional() });
    expect(diff(schema, object({ a: { type: 'string' } }, []))).toEqual([]);
  });
});

describe('contractDiff reports', () => {
  it('a field missing in web', () => {
    const lines = diff(
      z.object({ id: z.string() }),
      object({ id: { type: 'string' }, name: { type: 'string' } }),
    );
    expect(lines).toEqual([`${prefix}name: in api, missing in web`]);
  });

  it('a field in web that the api does not have', () => {
    const lines = diff(
      z.object({ id: z.string(), extra: z.string() }),
      object({ id: { type: 'string' } }),
    );
    expect(lines).toEqual([`${prefix}extra: in web, not in api`]);
  });

  it('a wrong type, naming the nested field', () => {
    const schema = z.object({ brand: z.object({ name: z.string() }) });
    const component = object({ brand: ref('BrandDto') });
    const lines = diff(schema, component, { BrandDto: object({ name: { type: 'number' } }) });
    expect(lines).toEqual([`${prefix}brand.name: web has string, api has number`]);
  });

  it('a type difference inside an array', () => {
    const lines = diff(
      z.object({ items: z.array(z.string()) }),
      object({ items: { type: 'array', items: { type: 'number' } } }),
    );
    expect(lines).toEqual([`${prefix}items[]: web has string, api has number`]);
  });

  it.each(['uuid', 'date-time', 'date', 'uri'])('a %s format only in the api', (format) => {
    const lines = diff(z.object({ v: z.string() }), object({ v: { type: 'string', format } }));
    expect(lines).toEqual([`${prefix}v: web has string, api has string (${format})`]);
  });

  it('a format only in web', () => {
    const lines = diff(z.object({ v: z.uuid() }), object({ v: { type: 'string' } }));
    expect(lines).toEqual([`${prefix}v: web has string (uuid), api has string`]);
  });

  it('nullable in api only', () => {
    const lines = diff(
      z.object({ v: z.string() }),
      object({ v: { type: 'string', nullable: true } }),
    );
    expect(lines).toEqual([`${prefix}v: nullable in api, not in web`]);
  });

  it('nullable in web only', () => {
    const lines = diff(z.object({ v: z.string().nullable() }), object({ v: { type: 'string' } }));
    expect(lines).toEqual([`${prefix}v: nullable in web, not in api`]);
  });

  it('required in api, optional in web', () => {
    const lines = diff(z.object({ v: z.string().optional() }), object({ v: { type: 'string' } }));
    expect(lines).toEqual([`${prefix}v: required in api, optional in web`]);
  });

  it('a .default() field: forbidden, and optional on the input side', () => {
    const schema = z.object({ tags: z.array(z.string()).default([]) });
    const lines = diff(schema, object({ tags: { type: 'array', items: { type: 'string' } } }));
    expect(lines).toEqual([
      `${prefix}tags: .default() or .catch() in web (H19)`,
      `${prefix}tags: required in api, optional in web`,
    ]);
  });

  it('a transform on an ISO datetime', () => {
    const schema = z.object({ at: z.iso.datetime().transform((value) => new Date(value)) });
    expect(diff(schema, object({ at: { type: 'string', format: 'date-time' } }))).toEqual([
      `${prefix}(root): a transform in web (H19)`,
    ]);
  });

  it('a transform nested in a field of a nested object', () => {
    const schema = z.object({
      brand: z.object({ image: z.string().transform((key) => `/media/${key}`) }),
    });
    const component = object({ brand: ref('BrandDto') });
    expect(diff(schema, component, { BrandDto: object({ image: { type: 'string' } }) })).toEqual([
      `${prefix}(root): a transform in web (H19)`,
    ]);
  });

  it('a transform at the root', () => {
    const schema = z.string().transform((value) => value.length);
    expect(diff(schema, { type: 'string' })).toEqual([`${prefix}(root): a transform in web (H19)`]);
  });

  it('.catch() on an enum inside an object', () => {
    const schema = z.object({ g: z.enum(['men', 'women']).catch('men') });
    const component = object({ g: { type: 'string', enum: ['men', 'women'] } });
    const lines = diff(schema, component);
    expect(lines).toContain(`${prefix}g: .default() or .catch() in web (H19)`);
    expect(lines.filter((line) => line.includes('(H19)'))).toHaveLength(1);
  });

  it('.default() inside an array item, naming items[]', () => {
    const schema = z.object({ items: z.array(z.object({ n: z.string().default('x') })) });
    const component = object({
      items: { type: 'array', items: object({ n: { type: 'string' } }) },
    });
    expect(diff(schema, component)).toEqual([
      `${prefix}items[].n: .default() or .catch() in web (H19)`,
      `${prefix}items[].n: required in api, optional in web`,
    ]);
  });

  it('.default() on an array itself, naming the field', () => {
    const schema = z.object({ items: z.array(z.string()).default([]) });
    const lines = diff(schema, object({ items: { type: 'array', items: { type: 'string' } } }));
    expect(lines).toContain(`${prefix}items: .default() or .catch() in web (H19)`);
  });

  it('.default() on a nullable field', () => {
    const schema = z.object({ v: z.string().nullable().default(null) });
    const lines = diff(schema, object({ v: { type: 'string', nullable: true } }));
    expect(lines).toContain(`${prefix}v: .default() or .catch() in web (H19)`);
    expect(lines).toContain(`${prefix}v: required in api, optional in web`);
  });

  it('.default() inside a nullable (anyOf) field', () => {
    const schema = z.object({ v: z.string().default('x').nullable() });
    const lines = diff(schema, object({ v: { type: 'string', nullable: true } }));
    expect(lines).toContain(`${prefix}v: .default() or .catch() in web (H19)`);
  });

  it('.default() at the root', () => {
    const schema = z.string().default('x');
    expect(diff(schema, { type: 'string' })).toEqual([
      `${prefix}(root): .default() or .catch() in web (H19)`,
    ]);
  });

  it('optional in api, required in web', () => {
    const lines = diff(z.object({ v: z.string() }), object({ v: { type: 'string' } }, []));
    expect(lines).toEqual([`${prefix}v: optional in api, required in web`]);
  });

  it('an enum value missing in web', () => {
    const lines = diff(
      z.object({ g: z.enum(['men']) }),
      object({ g: { type: 'string', enum: ['men', 'women'] } }),
    );
    expect(lines).toEqual([`${prefix}g: enum values missing in web: women`]);
  });

  it('an extra enum value in web', () => {
    const lines = diff(
      z.object({ g: z.enum(['men', 'women', 'kids']) }),
      object({ g: { type: 'string', enum: ['men', 'women'] } }),
    );
    expect(lines).toEqual([`${prefix}g: enum values not in api: kids`]);
  });

  it('an enum only in web', () => {
    const lines = diff(z.object({ g: z.enum(['a']) }), object({ g: { type: 'string' } }));
    expect(lines).toEqual([`${prefix}g: enum in web, not in api`]);
  });

  it('an enum only in the api', () => {
    const lines = diff(z.object({ g: z.string() }), object({ g: { type: 'string', enum: ['a'] } }));
    expect(lines).toEqual([`${prefix}g: enum in api, not in web`]);
  });

  it('a z.literal against a plain api string', () => {
    const lines = diff(z.object({ k: z.literal('x') }), object({ k: { type: 'string' } }));
    expect(lines).toEqual([`${prefix}k: enum in web, not in api`]);
  });

  it('a z.literal with a different value than the api enum', () => {
    const lines = diff(
      z.object({ k: z.literal('y') }),
      object({ k: { type: 'string', enum: ['x'] } }),
    );
    expect(lines).toEqual([
      `${prefix}k: enum values missing in web: x`,
      `${prefix}k: enum values not in api: y`,
    ]);
  });

  it('object against array against scalar, naming the root', () => {
    expect(diff(z.object({}), { type: 'array', items: { type: 'string' } })).toEqual([
      `${prefix}(root): web has object, api has array`,
    ]);
    expect(diff(z.array(z.string()), { type: 'string' })).toEqual([
      `${prefix}(root): web has array, api has string`,
    ]);
    expect(diff(z.string(), object({}))).toEqual([
      `${prefix}(root): web has string, api has object`,
    ]);
  });

  it('every difference, not only the first', () => {
    const lines = diff(
      z.object({ a: z.string(), b: z.number() }),
      object({ a: { type: 'number' }, b: { type: 'string' } }),
    );
    expect(lines).toHaveLength(2);
  });
});

describe('contractDiff against a route response', () => {
  const listSchema = (item: z.ZodType) => z.object({ items: z.array(item), total: z.int() });
  const itemDto = object({ id: { type: 'string' }, name: { type: 'string' } });
  const listBody = (total: Json = { type: 'integer', minimum: 0 }): Json =>
    object({ items: { type: 'array', items: ref('ItemDto') }, total });

  function responseDocument(): OpenApiDocument {
    return {
      components: { schemas: { ItemDto: itemDto } },
      paths: {
        '/products': {
          get: {
            responses: {
              '200': { content: { 'application/json': { schema: listBody() } } },
            },
          },
        },
        '/gone': { delete: { responses: { '204': { description: '' } } } },
      },
    };
  }

  function responseDiff(
    schema: z.ZodType,
    response: OpenApiResponse,
    document = responseDocument(),
  ): string[] {
    return contractDiff(document, { name: NAME, schema, response });
  }

  const get200: OpenApiResponse = { method: 'get', path: '/products', status: '200' };
  const label = `${NAME} ↔ GET /products 200: `;
  const item = z.object({ id: z.string(), name: z.string() });

  it('matches an inline { items, total } wrapper with $ref items', () => {
    expect(responseDiff(listSchema(item), get200)).toEqual([]);
  });

  it('reports a renamed total with the response label', () => {
    const schema = z.object({ items: z.array(item), count: z.int() });
    expect(responseDiff(schema, get200)).toHaveLength(2);
    expect(responseDiff(schema, get200)).toEqual(
      expect.arrayContaining([
        `${label}count: in web, not in api`,
        `${label}total: in api, missing in web`,
      ]),
    );
  });

  it('reports a missing total', () => {
    expect(responseDiff(z.object({ items: z.array(item) }), get200)).toEqual([
      `${label}total: in api, missing in web`,
    ]);
  });

  it('reports a field missing in the item, with its path', () => {
    expect(responseDiff(listSchema(z.object({ id: z.string() })), get200)).toEqual([
      `${label}items[].name: in api, missing in web`,
    ]);
  });

  it.each([
    ['an unknown path', { method: 'get', path: '/x', status: '200' }, 'GET /x 200'],
    [
      'an unknown method',
      { method: 'post', path: '/products', status: '200' },
      'POST /products 200',
    ],
    ['an unknown status', { method: 'get', path: '/products', status: '404' }, 'GET /products 404'],
    [
      'a response without JSON',
      { method: 'delete', path: '/gone', status: '204' },
      'DELETE /gone 204',
    ],
  ] satisfies [string, OpenApiResponse, string][])(
    'says there is no JSON response for %s',
    (_, response, target) => {
      expect(responseDiff(z.string(), response)).toEqual([
        `${NAME} ↔ ${target}: no JSON response ${target} in the OpenAPI document`,
      ]);
    },
  );

  it('says so when the document has no paths', () => {
    expect(responseDiff(z.string(), get200, documentOf({}))).toEqual([
      `${label}no JSON response GET /products 200 in the OpenAPI document`,
    ]);
  });
});

describe('contractDiff does not throw', () => {
  it('on an unknown component name', () => {
    const lines = contractDiff(documentOf({}), {
      name: NAME,
      schema: z.string(),
      component: 'Nope',
    });
    expect(lines).toEqual([`${NAME} ↔ Nope: no component Nope in the OpenAPI document`]);
  });

  it('on a real union in web', () => {
    const lines = diff(z.union([z.string(), z.number()]), { type: 'string' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(prefix);
    expect(lines[0]).toContain('several types');
  });

  it('on an unknown $ref in the api', () => {
    const lines = diff(z.object({ a: z.string() }), object({ a: ref('Missing') }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('unknown $ref');
  });

  it('on an allOf of several schemas', () => {
    const lines = diff(z.string(), { allOf: [{ type: 'string' }, { type: 'string' }] });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('allOf');
  });

  it('on a web schema JSON Schema cannot express (z.coerce.date): one labelled line', () => {
    const lines = diff(z.object({ at: z.coerce.date() }), object({ at: { type: 'string' } }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(prefix);
  });

  it('on a web schema with a transform: forbidden, and still compared by the type it takes', () => {
    const schema = z.object({ n: z.string().transform((value) => value.length) });
    expect(diff(schema, object({ n: { type: 'number' } }))).toEqual([
      `${prefix}(root): a transform in web (H19)`,
      `${prefix}n: web has string, api has number`,
    ]);
  });

  it('on a node without a type', () => {
    const lines = diff(z.string(), {});
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(prefix);
  });
});
