// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn(() => Promise.resolve()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ SITE_URL: 'https://site.test' }),
}));

import { connection } from 'next/server';

import { catalogRobots } from './robots';

describe('catalogRobots', () => {
  it('allows the site but the account, the kit and the health check, and names the sitemap', async () => {
    expect(await catalogRobots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/customer', '/ui-kit', '/healthz'] },
      sitemap: 'https://site.test/sitemap.xml',
    });
    expect(connection).toHaveBeenCalledOnce();
  });
});
