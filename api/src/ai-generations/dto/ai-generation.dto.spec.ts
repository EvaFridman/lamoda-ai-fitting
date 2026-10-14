import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../common/errors/app.exception.js';
import { createValidationPipe } from '../../common/validation/validation-pipe.js';
import { AiGenerationListQueryDto } from './ai-generation-list-query.dto.js';
import { CreateAiGenerationDto } from './create-ai-generation.dto.js';
import { UpdateAiGenerationDto } from './update-ai-generation.dto.js';

const pipe = createValidationPipe();

function valid(): Record<string, unknown> {
  return {
    sessionId: randomUUID(),
    productIds: [randomUUID()],
    userImageKey: 'users/photo.jpg',
    status: 'pending',
    aiProvider: 'openai',
    aiModel: 'gpt-image-1',
  };
}

async function create(body: Record<string, unknown>): Promise<CreateAiGenerationDto> {
  return (await pipe.transform(body, {
    type: 'body',
    metatype: CreateAiGenerationDto,
  })) as CreateAiGenerationDto;
}

async function update(body: Record<string, unknown>): Promise<UpdateAiGenerationDto> {
  return (await pipe.transform(body, {
    type: 'body',
    metatype: UpdateAiGenerationDto,
  })) as UpdateAiGenerationDto;
}

async function failedFields(run: Promise<unknown>): Promise<string[]> {
  const error: unknown = await run.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(ValidationError);
  const body = (error as ValidationError).body.error;
  expect(body.code).toBe('VALIDATION_FAILED');
  return body.details.map((detail) => detail.field);
}

describe('CreateAiGenerationDto', () => {
  it('accepts a valid body and leaves the optional fields out', async () => {
    const dto = await create(valid());

    expect(dto.resultImageKey).toBeUndefined();
    expect(dto.errorMessage).toBeUndefined();
  });

  it('accepts null resultImageKey and errorMessage', async () => {
    const dto = await create({ ...valid(), resultImageKey: null, errorMessage: null });

    expect(dto.resultImageKey).toBeNull();
    expect(dto.errorMessage).toBeNull();
  });

  it.each(['sessionId', 'productIds', 'userImageKey', 'status', 'aiProvider', 'aiModel'])(
    'requires %s',
    async (field) => {
      const body = valid();
      delete body[field];

      expect(await failedFields(create(body))).toContain(field);
    },
  );

  it('lower-cases product ids', async () => {
    const id = randomUUID();

    const dto = await create({ ...valid(), productIds: [id.toUpperCase()] });

    expect(dto.productIds).toEqual([id]);
  });

  it('accepts 1 and 20 product ids', async () => {
    const twenty = Array.from({ length: 20 }, () => randomUUID());

    expect((await create({ ...valid(), productIds: twenty })).productIds).toHaveLength(20);
  });

  it('refuses no product ids and 21 product ids', async () => {
    const many = Array.from({ length: 21 }, () => randomUUID());

    expect(await failedFields(create({ ...valid(), productIds: [] }))).toContain('productIds');
    expect(await failedFields(create({ ...valid(), productIds: many }))).toContain('productIds');
  });

  it('refuses duplicate product ids, also when only the letter case differs', async () => {
    const id = randomUUID();

    expect(await failedFields(create({ ...valid(), productIds: [id, id] }))).toContain(
      'productIds',
    );
    expect(
      await failedFields(create({ ...valid(), productIds: [id, id.toUpperCase()] })),
    ).toContain('productIds');
  });

  it.each([
    ['null', null],
    ['a string', randomUUID()],
    ['not uuids', ['x']],
    ['a number item', [5]],
  ])('refuses productIds that is %s', async (_label, productIds) => {
    const fields = await failedFields(create({ ...valid(), productIds }));

    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every((field) => field.startsWith('productIds'))).toBe(true);
  });

  it.each(['sessionId', 'userImageKey', 'status', 'aiProvider', 'aiModel'])(
    'refuses null %s',
    async (field) => {
      expect(await failedFields(create({ ...valid(), [field]: null }))).toContain(field);
    },
  );

  it('refuses a status outside the enum', async () => {
    expect(await failedFields(create({ ...valid(), status: 'done' }))).toContain('status');
  });

  it.each(['pending', 'processing', 'completed', 'failed'])('accepts status %s', async (status) => {
    expect((await create({ ...valid(), status })).status).toBe(status);
  });

  it.each(['aiProvider', 'aiModel'])('limits %s to 50 trimmed characters', async (field) => {
    expect(
      (await create({ ...valid(), [field]: 'a'.repeat(50) }))[field as 'aiModel'],
    ).toHaveLength(50);
    for (const bad of ['a'.repeat(51), ' a', 'a ', '', 'a\u0000b']) {
      expect(await failedFields(create({ ...valid(), [field]: bad }))).toContain(field);
    }
  });

  it('limits errorMessage to 1000 trimmed characters without NUL', async () => {
    expect(
      (await create({ ...valid(), status: 'failed', errorMessage: 'e'.repeat(1000) })).errorMessage,
    ).toHaveLength(1000);
    for (const bad of ['e'.repeat(1001), ' e', 'e ', '', 'e\u0000']) {
      expect(await failedFields(create({ ...valid(), errorMessage: bad }))).toContain(
        'errorMessage',
      );
    }
  });

  it.each(['userImageKey', 'resultImageKey'])('checks %s as an image key', async (field) => {
    expect(
      (await create({ ...valid(), [field]: 'a'.repeat(255) }))[field as 'userImageKey'],
    ).toHaveLength(255);
    for (const bad of ['a'.repeat(256), '/abs.jpg', '../x.jpg', 'a b.jpg', '', 5]) {
      expect(await failedFields(create({ ...valid(), [field]: bad }))).toContain(field);
    }
  });

  it('refuses an unknown field', async () => {
    expect(await failedFields(create({ ...valid(), id: randomUUID() }))).toContain('id');
  });
});

describe('UpdateAiGenerationDto', () => {
  it('accepts an empty body', async () => {
    expect(Object.keys(await update({}))).toEqual([]);
  });

  it('refuses sessionId', async () => {
    expect(await failedFields(update({ sessionId: randomUUID() }))).toContain('sessionId');
  });

  it('lower-cases product ids', async () => {
    const id = randomUUID();

    expect((await update({ productIds: [id.toUpperCase()] })).productIds).toEqual([id]);
  });

  it('refuses null productIds, an empty list and duplicates', async () => {
    const id = randomUUID();

    expect(await failedFields(update({ productIds: null }))).toContain('productIds');
    expect(await failedFields(update({ productIds: [] }))).toContain('productIds');
    expect(await failedFields(update({ productIds: [id, id.toUpperCase()] }))).toContain(
      'productIds',
    );
  });

  it.each(['status', 'aiProvider', 'aiModel', 'userImageKey'])('refuses null %s', async (field) => {
    expect(await failedFields(update({ [field]: null }))).toContain(field);
  });

  it('accepts null resultImageKey and errorMessage to clear them', async () => {
    const dto = await update({ resultImageKey: null, errorMessage: null });

    expect(dto.resultImageKey).toBeNull();
    expect(dto.errorMessage).toBeNull();
  });

  it('applies the field rules to the values sent', async () => {
    expect(await failedFields(update({ aiModel: ' x' }))).toContain('aiModel');
    expect(await failedFields(update({ status: 'done' }))).toContain('status');
    expect(await failedFields(update({ errorMessage: 'e'.repeat(1001) }))).toContain(
      'errorMessage',
    );
    expect(await failedFields(update({ resultImageKey: '../x' }))).toContain('resultImageKey');
  });
});

describe('AiGenerationListQueryDto', () => {
  async function query(value: Record<string, unknown>): Promise<AiGenerationListQueryDto> {
    return (await pipe.transform(value, {
      type: 'query',
      metatype: AiGenerationListQueryDto,
    })) as AiGenerationListQueryDto;
  }

  it('accepts no filter and a uuid', async () => {
    const sessionId = randomUUID();

    expect((await query({})).sessionId).toBeUndefined();
    expect((await query({ sessionId })).sessionId).toBe(sessionId);
  });

  it('refuses an empty, malformed or repeated sessionId and an unknown parameter', async () => {
    const id = randomUUID();

    expect(await failedFields(query({ sessionId: '' }))).toContain('sessionId');
    expect(await failedFields(query({ sessionId: 'x' }))).toContain('sessionId');
    expect(await failedFields(query({ sessionId: [id, id] }))).toContain('sessionId');
    expect(await failedFields(query({ userId: id }))).toContain('userId');
  });
});
