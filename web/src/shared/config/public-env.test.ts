import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('yandexMapsApiKey', () => {
  it('is empty when the variable is not set', async () => {
    vi.stubEnv('NEXT_PUBLIC_YANDEX_MAPS_API_KEY', undefined);
    const { yandexMapsApiKey } = await import('./public-env');
    expect(yandexMapsApiKey).toBe('');
  });

  it('is the variable when it is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_YANDEX_MAPS_API_KEY', 'key-123');
    const { yandexMapsApiKey } = await import('./public-env');
    expect(yandexMapsApiKey).toBe('key-123');
  });
});
