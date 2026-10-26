// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn(() => Promise.resolve()) }));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(() => Promise.resolve()) }));
vi.mock('@/entities/category/server', () => ({ readActiveCategories: vi.fn() }));
vi.mock('@/entities/product/server', () => ({ readFirstProduct: vi.fn() }));

import { connection } from 'next/server';
import { setTimeout as sleep } from 'node:timers/promises';

import { readActiveCategories } from '@/entities/category/server';
import { readFirstProduct } from '@/entities/product/server';

import {
  EXCLUDED,
  PRODUCT_READ_INTERVAL_MS,
  WARMUP,
  WARMUP_CATEGORY_MAX,
  WARMUP_PRODUCT_MAX,
  warmupList,
  warmupRoute,
} from './routes';

// A file of `web/app` that Next serves at an address of its own, and the route it answers
// (spec 0018 plan §4, AC12): pages, route handlers and the metadata files.
const CODE = /\.(js|jsx|ts|tsx)$/;
// Next takes a numbered variant of an image too (`icon1.png`, `opengraph-image2.tsx`).
const METADATA_IMAGE = /^(icon|apple-icon|opengraph-image|twitter-image)\d?$/;
const METADATA_DOCUMENTS: Record<string, string> = {
  sitemap: 'sitemap.xml',
  robots: 'robots.txt',
  manifest: 'manifest.webmanifest',
};

function routeName(file: string): string | null {
  const code = CODE.test(file);
  const name = file.replace(/\.[^.]+$/, '');
  if (code && (name === 'page' || name === 'route')) return '';
  if (METADATA_IMAGE.test(name)) return code ? name : file;
  if (name in METADATA_DOCUMENTS) return code ? (METADATA_DOCUMENTS[name] ?? null) : file;
  if (file === 'favicon.ico') return file;
  return null;
}

const GROUP = /^\(.*\)$/;

// The route patterns of every routable file under `dir`: route groups `(x)` and slots `@x` leave
// no segment, private folders `_x` route nothing. Two shapes whose address this walk cannot tell
// stop it, to be decided when one appears: an intercepting segment (`(.)x`), and a metadata file
// inside a group or a slot (Next adds a hash to its address).
function appRoutes(dir: string): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const relativePath = relative(dir, join(entry.parentPath, entry.name));
    const segments = relativePath.split(sep);
    const file = segments.pop() ?? '';
    if (segments.some((segment) => segment.startsWith('_'))) continue;
    const name = routeName(file);
    if (name === null) continue;
    if (segments.some((segment) => /^\(\.{1,3}\)/.test(segment))) {
      throw new Error(`${relativePath}: an intercepting route, add it to the walk`);
    }
    if (name !== '' && segments.some((segment) => GROUP.test(segment) || segment.startsWith('@'))) {
      throw new Error(`${relativePath}: a metadata file in a group or a slot, add it to the walk`);
    }
    const path = [
      ...segments.filter((segment) => !GROUP.test(segment) && !segment.startsWith('@')),
      name,
    ]
      .filter(Boolean)
      .join('/');
    routes.push(`/${path}`);
  }
  return [...new Set(routes)].sort();
}

function covers(entry: string, route: string): boolean {
  return entry.endsWith('/*')
    ? route === entry.slice(0, -2) || route.startsWith(entry.slice(0, -1))
    : route === entry;
}

interface Lists {
  warm: readonly { route: string; source: string }[];
  excluded: Readonly<Record<string, string>>;
}

// What fails the check: a route in neither list (or in both), and an entry no file backs (but a
// redirect, which `next.config.ts` answers).
function checkRoutes(routes: string[], { warm, excluded }: Lists) {
  const entries = [
    ...warm.filter(({ source }) => source !== 'redirect').map(({ route }) => route),
    ...Object.keys(excluded),
  ];
  return {
    unlisted: routes.filter(
      (route) => entries.filter((entry) => covers(entry, route)).length !== 1,
    ),
    unbacked: entries.filter((entry) => !routes.some((route) => covers(entry, route))),
  };
}

const APP = join(__dirname, '../../../app');

describe('the warm-up list', () => {
  it('names every route of web/app once, warmed up or excluded, and nothing else', () => {
    expect(checkRoutes(appRoutes(APP), { warm: WARMUP, excluded: EXCLUDED })).toEqual({
      unlisted: [],
      unbacked: [],
    });
  });

  it('warms up the pages a visitor reaches without signing in (AC11)', () => {
    expect(WARMUP.map(({ route }) => route)).toEqual(
      expect.arrayContaining([
        '/',
        '/catalog',
        '/catalog/[slug]',
        '/privacy',
        '/products/[id]',
        '/sitemap.xml',
        '/robots.txt',
      ]),
    );
  });

  it('names the product pages by their own source', () => {
    expect(WARMUP).toContainEqual({ route: '/products/[id]', source: 'products' });
  });

  it('backs each redirect entry by a redirect of next.config.ts', async () => {
    const { default: nextConfig } = await import('../../../next.config');
    const sources = ((await nextConfig.redirects?.()) ?? []).map(({ source }) => source);
    const redirects = WARMUP.filter(({ source }) => source === 'redirect').map(
      ({ route }) => route,
    );
    expect(sources).toEqual(expect.arrayContaining(redirects));
  });

  it('gives a reason for each exclusion', () => {
    expect(Object.keys(EXCLUDED)).toEqual(
      expect.arrayContaining(['/customer', '/ui-kit', '/healthz', '/healthz/warmup']),
    );
    for (const reason of Object.values(EXCLUDED)) expect(reason.trim()).not.toBe('');
  });
});

describe('the check over a fixture tree (AC12)', () => {
  let root: string;

  function touch(...files: string[]) {
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), '');
    }
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'warmup-routes-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('turns files into routes', () => {
    touch(
      'layout.tsx',
      'global-error.tsx',
      'globals.scss',
      'page.tsx',
      '(shop)/cart/page.tsx',
      'shop/[slug]/page.tsx',
      'shop/@modal/details/page.tsx',
      'shop/_parts/page.tsx',
      'shop/opengraph-image.tsx',
      'shop/twitter-image.png',
      'sitemap.ts',
      'robots.ts',
      'healthz/route.ts',
    );
    expect(appRoutes(root)).toEqual([
      '/',
      '/cart',
      '/healthz',
      '/robots.txt',
      '/shop/[slug]',
      '/shop/details',
      '/shop/opengraph-image',
      '/shop/twitter-image.png',
      '/sitemap.xml',
    ]);
  });

  it('knows static metadata files, the manifest, deep private folders and nested groups', () => {
    touch(
      'favicon.ico',
      'opengraph-image.png',
      'manifest.ts',
      'shop/deep/_internal/nested/page.tsx',
      'shop/_internal/nested/route.ts',
      '(a)/(b)/info/page.tsx',
      '(a)/(b)/(c)/page.tsx',
    );
    expect(appRoutes(root)).toEqual([
      '/',
      '/favicon.ico',
      '/info',
      '/manifest.webmanifest',
      '/opengraph-image.png',
    ]);
  });

  it('knows the numbered variants of metadata images', () => {
    touch('icon1.png', 'shop/opengraph-image2.tsx');
    expect(appRoutes(root)).toEqual(['/icon1.png', '/shop/opengraph-image2']);
  });

  it('stops on an intercepting route', () => {
    touch('shop/(.)photo/page.tsx');
    expect(() => appRoutes(root)).toThrow('an intercepting route');
  });

  it.each(['(shop)/opengraph-image.tsx', 'shop/@modal/opengraph-image.tsx'])(
    'stops on a metadata file inside a group or a slot: %s',
    (file) => {
      touch(file);
      expect(() => appRoutes(root)).toThrow('a metadata file in a group or a slot');
    },
  );

  it('fails on a new page in neither list', () => {
    touch('catalog/page.tsx', 'account/page.tsx', 'account/orders/page.tsx', 'new/page.tsx');
    const lists = {
      warm: [{ route: '/catalog', source: 'static' }],
      excluded: { '/account/*': 'the user’s data' },
    };
    expect(checkRoutes(appRoutes(root), lists)).toEqual({ unlisted: ['/new'], unbacked: [] });
  });

  it('fails on a route in both lists', () => {
    touch('catalog/page.tsx');
    const lists = {
      warm: [{ route: '/catalog', source: 'static' }],
      excluded: { '/catalog': 'both' },
    };
    expect(checkRoutes(appRoutes(root), lists).unlisted).toEqual(['/catalog']);
  });

  it('fails on an entry no file backs, except a redirect', () => {
    touch('catalog/page.tsx');
    const lists = {
      warm: [
        { route: '/', source: 'redirect' },
        { route: '/catalog', source: 'static' },
        { route: '/gone', source: 'static' },
      ],
      excluded: { '/dev/*': 'development pages' },
    };
    expect(checkRoutes(appRoutes(root), lists)).toEqual({
      unlisted: [],
      unbacked: ['/gone', '/dev/*'],
    });
  });

  it('does not let `/x/*` cover `/xy`', () => {
    touch('customer/page.tsx', 'customers/page.tsx');
    const lists = { warm: [], excluded: { '/customer/*': 'the account' } };
    expect(checkRoutes(appRoutes(root), lists).unlisted).toEqual(['/customers']);
  });
});

describe('warmupList', () => {
  const read = vi.mocked(readActiveCategories);

  function categories(slugs: string[], total = slugs.length) {
    return {
      items: slugs.map((slug) => ({ id: slug, name: slug, slug, isActive: true })),
      total,
    } as unknown as Awaited<ReturnType<typeof readActiveCategories>>;
  }

  const readProduct = vi.mocked(readFirstProduct);

  beforeEach(() => {
    read.mockReset();
    readProduct.mockReset();
    readProduct.mockResolvedValue(undefined);
    vi.mocked(sleep).mockClear();
    vi.mocked(connection).mockClear();
  });

  it('resolves the routes to addresses at request time, a page per active category', async () => {
    read.mockResolvedValue(categories(['dresses', 'платья']));
    expect(await warmupList()).toEqual({
      paths: [
        '/',
        '/catalog',
        '/catalog/dresses',
        `/catalog/${encodeURIComponent('платья')}`,
        '/catalog/opengraph-image',
        '/catalog/twitter-image',
        '/customer/stores',
        '/privacy',
        '/sitemap.xml',
        '/robots.txt',
      ],
      skipped: 0,
    });
    expect(connection).toHaveBeenCalledOnce();
  });

  it(`requests at most ${WARMUP_CATEGORY_MAX} categories and counts the rest (V16)`, async () => {
    const slugs = Array.from({ length: 60 }, (_, index) => `c${index}`);
    read.mockResolvedValue(categories(slugs, 130));
    const { paths, skipped } = await warmupList();
    const pages = paths.filter((path) => /^\/catalog\/c\d+$/.test(path));
    expect(pages).toEqual(slugs.slice(0, WARMUP_CATEGORY_MAX).map((slug) => `/catalog/${slug}`));
    // 80 category pages and 105 categories without a product page.
    expect(skipped).toBe(185);
  });

  it('fails when the categories cannot be read', async () => {
    read.mockRejectedValue(new Error('down'));
    await expect(warmupList()).rejects.toThrow('down');
  });

  it('reads no category before the request is connected', async () => {
    let connect: () => void = () => {};
    vi.mocked(connection).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        connect = resolve;
      }),
    );
    read.mockResolvedValue(categories(['dresses']));
    const pending = warmupList();
    await Promise.resolve();
    await Promise.resolve();
    expect(read).not.toHaveBeenCalled();
    connect();
    await pending;
    expect(read).toHaveBeenCalledOnce();
  });

  it('puts the category pages where /catalog/[slug] sits in the list', async () => {
    read.mockResolvedValue(categories(['a', 'b']));
    const { paths } = await warmupList();
    const at = WARMUP.findIndex(({ route }) => route === '/catalog/[slug]');
    expect(paths.slice(at, at + 2)).toEqual(['/catalog/a', '/catalog/b']);
    expect(paths[at - 1]).toBe('/catalog');
    expect(paths[at + 2]).toBe('/catalog/opengraph-image');
  });

  it('encodes each slug into one path segment', async () => {
    read.mockResolvedValue(categories(['a b', 'x/y', 'q?#']));
    const { paths } = await warmupList();
    expect(paths).toEqual(
      expect.arrayContaining(['/catalog/a%20b', '/catalog/x%2Fy', '/catalog/q%3F%23']),
    );
  });

  it('skips no category page at exactly the bound, only the products over theirs', async () => {
    const slugs = Array.from({ length: WARMUP_CATEGORY_MAX }, (_, index) => `c${index}`);
    read.mockResolvedValue(categories(slugs));
    const { paths, skipped } = await warmupList();
    expect(paths.filter((path) => /^\/catalog\/c\d+$/.test(path))).toHaveLength(
      WARMUP_CATEGORY_MAX,
    );
    expect(skipped).toBe(WARMUP_CATEGORY_MAX - WARMUP_PRODUCT_MAX);
  });

  it('skips nothing at exactly the product bound', async () => {
    const slugs = Array.from({ length: WARMUP_PRODUCT_MAX }, (_, index) => `c${index}`);
    read.mockResolvedValue(categories(slugs));
    expect((await warmupList()).skipped).toBe(0);
  });

  it('counts one skipped category page and 26 product categories just over the category bound', async () => {
    const slugs = Array.from({ length: WARMUP_CATEGORY_MAX + 1 }, (_, index) => `c${index}`);
    read.mockResolvedValue(categories(slugs));
    expect((await warmupList()).skipped).toBe(1 + (WARMUP_CATEGORY_MAX + 1 - WARMUP_PRODUCT_MAX));
  });

  it('counts one skipped product category just over the product bound', async () => {
    const slugs = Array.from({ length: WARMUP_PRODUCT_MAX + 1 }, (_, index) => `c${index}`);
    read.mockResolvedValue(categories(slugs));
    expect((await warmupList()).skipped).toBe(1);
  });

  it('trusts the items when the api reports a smaller total', async () => {
    const slugs = Array.from({ length: 60 }, (_, index) => `c${index}`);
    read.mockResolvedValue(categories(slugs, 10));
    expect((await warmupList()).skipped).toBe(10 + 35);
  });

  describe('the product pages (spec 0019 A81)', () => {
    const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

    function slugsOf(count: number): string[] {
      return Array.from({ length: count }, (_, index) => `c${index}`);
    }

    function newestIs(byCategory: Record<string, string | undefined>) {
      readProduct.mockImplementation((categoryId) => {
        const id = byCategory[categoryId];
        return Promise.resolve(
          id === undefined ? undefined : ({ id } as unknown as { id: string } as never),
        );
      });
    }

    it('asks for the newest product of each of the first categories, in order', async () => {
      read.mockResolvedValue(categories(slugsOf(3)));
      newestIs({ c0: ID(0), c1: ID(1), c2: ID(2) });
      const { paths } = await warmupList();
      expect(readProduct.mock.calls.map(([categoryId]) => categoryId)).toEqual(['c0', 'c1', 'c2']);
      expect(paths.filter((path) => path.startsWith('/products/'))).toEqual([
        `/products/${ID(0)}`,
        `/products/${ID(1)}`,
        `/products/${ID(2)}`,
      ]);
    });

    it('puts the product pages where /products/[id] sits in the list', async () => {
      read.mockResolvedValue(categories(slugsOf(2)));
      newestIs({ c0: ID(0), c1: ID(1) });
      const { paths } = await warmupList();
      const at = paths.indexOf(`/products/${ID(0)}`);
      expect(paths[at - 1]).toBe('/privacy');
      expect(paths[at + 1]).toBe(`/products/${ID(1)}`);
      expect(paths[at + 2]).toBe('/sitemap.xml');
    });

    it('reads at most the first 25 categories', async () => {
      read.mockResolvedValue(categories(slugsOf(WARMUP_PRODUCT_MAX + 5)));
      await warmupList();
      expect(readProduct).toHaveBeenCalledTimes(WARMUP_PRODUCT_MAX);
      expect(readProduct).toHaveBeenLastCalledWith(`c${WARMUP_PRODUCT_MAX - 1}`);
    });

    it('adds no address for a category without a product', async () => {
      read.mockResolvedValue(categories(slugsOf(3)));
      newestIs({ c0: ID(0), c1: undefined, c2: ID(2) });
      const { paths, skipped } = await warmupList();
      expect(paths.filter((path) => path.startsWith('/products/'))).toEqual([
        `/products/${ID(0)}`,
        `/products/${ID(2)}`,
      ]);
      expect(skipped).toBe(0);
    });

    it('adds no product page when there is no category', async () => {
      read.mockResolvedValue(categories([]));
      await warmupList();
      expect(readProduct).not.toHaveBeenCalled();
    });

    it('waits between the reads, not before the first and not after the last', async () => {
      read.mockResolvedValue(categories(slugsOf(3)));
      await warmupList();
      expect(sleep).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenNthCalledWith(1, PRODUCT_READ_INTERVAL_MS);
      expect(sleep).toHaveBeenNthCalledWith(2, PRODUCT_READ_INTERVAL_MS);
      expect(PRODUCT_READ_INTERVAL_MS).toBe(200);
    });

    it('does not wait for a single category', async () => {
      read.mockResolvedValue(categories(slugsOf(1)));
      await warmupList();
      expect(sleep).not.toHaveBeenCalled();
    });

    it('reads one at a time: the next read starts only after the wait', async () => {
      read.mockResolvedValue(categories(slugsOf(2)));
      let release: () => void = () => {};
      vi.mocked(sleep).mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }) as never,
      );
      const pending = warmupList();
      await vi.waitFor(() => expect(sleep).toHaveBeenCalledTimes(1));
      for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
      expect(readProduct).toHaveBeenCalledTimes(1);
      release();
      await pending;
      expect(readProduct).toHaveBeenCalledTimes(2);
    });

    it('does not start the next read before the previous one answers', async () => {
      read.mockResolvedValue(categories(slugsOf(2)));
      let answer: (value: undefined) => void = () => {};
      readProduct.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
      const pending = warmupList();
      await vi.waitFor(() => expect(readProduct).toHaveBeenCalledTimes(1));
      for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
      expect(sleep).not.toHaveBeenCalled();
      expect(readProduct).toHaveBeenCalledTimes(1);
      answer(undefined);
      await pending;
      expect(readProduct).toHaveBeenCalledTimes(2);
    });

    it('encodes each id into one path segment', async () => {
      read.mockResolvedValue(categories(slugsOf(1)));
      newestIs({ c0: 'a b/c' });
      const { paths } = await warmupList();
      expect(paths).toContain('/products/a%20b%2Fc');
    });

    it('fails, and warms nothing partial, when a product read fails', async () => {
      read.mockResolvedValue(categories(slugsOf(3)));
      readProduct
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('products down'));
      await expect(warmupList()).rejects.toThrow('products down');
      expect(readProduct).toHaveBeenCalledTimes(2);
    });
  });

  it('lists only the other pages when there is no category', async () => {
    read.mockResolvedValue(categories([]));
    expect(await warmupList()).toEqual({
      paths: [
        '/',
        '/catalog',
        '/catalog/opengraph-image',
        '/catalog/twitter-image',
        '/customer/stores',
        '/privacy',
        '/sitemap.xml',
        '/robots.txt',
      ],
      skipped: 0,
    });
  });

  it('answers no 200 with a partial list when the read fails', async () => {
    read.mockRejectedValue(new Error('down'));
    await expect(warmupRoute()).rejects.toThrow('down');
  });

  it('answers the list as JSON, never stored', async () => {
    read.mockResolvedValue(categories(['dresses']));
    const response = await warmupRoute();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ skipped: 0 });
  });
});
