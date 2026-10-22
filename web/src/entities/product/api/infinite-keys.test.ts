import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/api/server', () => ({ apiFetch: vi.fn() }));

import { productKeys } from './keys';
import { productInfiniteOptions as browserOptions } from './queries';
import { productInfiniteOptions as serverOptions } from './server-queries';

const query = { q: 'платье', sort: 'price_asc' } as const;

describe('the infinite list keys', () => {
  it('differ by the batch the list starts from', () => {
    expect(productKeys.infinite(query, 'c-1')).not.toEqual(productKeys.infinite(query));
    expect(productKeys.infinite(query, 'c-1')).not.toEqual(productKeys.infinite(query, 'c-2'));
  });

  it('treat no start and a null start alike', () => {
    expect(productKeys.infinite(query)).toEqual(productKeys.infinite(query, null));
    expect(productKeys.infinite(query).at(-1)).toBeNull();
  });

  it('ignore an offset, as the batches have none', () => {
    const wide = { ...query, offset: 40 };
    expect(productKeys.infinite(wide, 'c')).toEqual(productKeys.infinite(query, 'c'));
  });

  it('are equal for the server and the browser, with a start and without', () => {
    for (const start of [undefined, null, 'c-1']) {
      expect(serverOptions(query, start).queryKey).toEqual(browserOptions(query, start).queryKey);
    }
    expect(serverOptions(query).queryKey).toEqual(browserOptions(query).queryKey);
  });

  it('start the pages from that cursor on both sides', () => {
    expect(serverOptions(query, 'c-1').initialPageParam).toBe('c-1');
    expect(browserOptions(query, 'c-1').initialPageParam).toBe('c-1');
    expect(serverOptions(query).initialPageParam).toBeNull();
    expect(browserOptions(query).initialPageParam).toBeNull();
  });
});
