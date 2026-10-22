// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn(() => Promise.resolve()) }));
vi.mock('@/entities/category/server', () => ({ readActiveCategories: vi.fn() }));

import { connection } from 'next/server';

import { readActiveCategories } from '@/entities/category/server';

import { EXCLUDED, WARMUP, WARMUP_CATEGORY_MAX, warmupList, warmupRoute } from './routes';

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
        '/sitemap.xml',
        '/robots.txt',
      ]),
    );
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
      expect.arrayContaining(['/customer/*', '/ui-kit', '/healthz', '/healthz/warmup']),
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

  beforeEach(() => {
    read.mockReset();
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
    expect(skipped).toBe(80);
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

  it('skips nothing at exactly the bound', async () => {
    const slugs = Array.from({ length: WARMUP_CATEGORY_MAX }, (_, index) => `c${index}`);
    read.mockResolvedValue(categories(slugs));
    const { paths, skipped } = await warmupList();
    expect(paths.filter((path) => /^\/catalog\/c\d+$/.test(path))).toHaveLength(
      WARMUP_CATEGORY_MAX,
    );
    expect(skipped).toBe(0);
  });

  it('counts one skipped category just over the bound', async () => {
    const slugs = Array.from({ length: WARMUP_CATEGORY_MAX + 1 }, (_, index) => `c${index}`);
    read.mockResolvedValue(categories(slugs));
    expect((await warmupList()).skipped).toBe(1);
  });

  it('trusts the items when the api reports a smaller total', async () => {
    const slugs = Array.from({ length: 60 }, (_, index) => `c${index}`);
    read.mockResolvedValue(categories(slugs, 10));
    expect((await warmupList()).skipped).toBe(10);
  });

  it('lists only the other pages when there is no category', async () => {
    read.mockResolvedValue(categories([]));
    expect(await warmupList()).toEqual({
      paths: [
        '/',
        '/catalog',
        '/catalog/opengraph-image',
        '/catalog/twitter-image',
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
