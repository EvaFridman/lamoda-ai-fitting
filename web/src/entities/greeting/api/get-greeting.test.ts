import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiPath } from '@/shared/api';
import { apiFetch } from '@/shared/api/server';

import { getGreeting } from './get-greeting';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/api/server', () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);

function schemaPassed() {
  const schema = apiFetchMock.mock.calls[0]?.[1];
  if (!schema) throw new Error('apiFetch was not called');
  return schema;
}

describe('getGreeting', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('asks apiFetch for /hello and returns its answer', async () => {
    apiFetchMock.mockResolvedValue({ message: 'Hello, world!' });

    await expect(getGreeting()).resolves.toEqual({ message: 'Hello, world!' });

    const path = apiFetchMock.mock.calls[0]?.[0] as ApiPath;
    expect(path.path).toBe('/hello');
    expect(path.template).toBe('/hello');
  });

  it('passes a schema that accepts { message: string }', async () => {
    apiFetchMock.mockResolvedValue({ message: 'x' });
    await getGreeting();

    expect(schemaPassed().safeParse({ message: 'Hi' }).success).toBe(true);
  });

  it.each([
    ['a number message', { message: 1 }],
    ['a missing message', {}],
    ['null', null],
    ['a string', 'Hi'],
  ])('passes a schema that rejects %s', async (_name, value) => {
    apiFetchMock.mockResolvedValue({ message: 'x' });
    await getGreeting();

    expect(schemaPassed().safeParse(value).success).toBe(false);
  });

  it('lets an apiFetch failure through', async () => {
    const error = new Error('down');
    apiFetchMock.mockRejectedValue(error);

    await expect(getGreeting()).rejects.toBe(error);
  });
});
