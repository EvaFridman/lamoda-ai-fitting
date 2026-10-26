import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { clusterByGrid } = vi.hoisted(() => ({ clusterByGrid: vi.fn() }));

vi.mock('@yandex/ymaps3-clusterer', () => ({ clusterByGrid }));

const reactifyModule = vi.fn((module: unknown) => ({ reactified: module }));
const ymaps3 = {
  ready: Promise.resolve(),
  import: vi.fn(async (_name: string) => ({
    reactify: { bindTo: () => ({ module: reactifyModule }) },
  })),
};

async function freshLoader() {
  vi.resetModules();
  return await import('./load-ymaps');
}

// The script's own load defines the global `ymaps3`.
function loaded(script: HTMLScriptElement | undefined) {
  vi.stubGlobal('ymaps3', ymaps3);
  script?.dispatchEvent(new Event('load'));
}

describe('loadYmaps', () => {
  let scripts: HTMLScriptElement[];
  let append: { mockRestore: () => void };

  beforeEach(() => {
    scripts = [];
    append = vi.spyOn(document.head, 'append').mockImplementation((...nodes: (Node | string)[]) => {
      for (const node of nodes) scripts.push(node as HTMLScriptElement);
    });
  });

  afterEach(() => {
    append.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    ymaps3.import.mockClear();
    reactifyModule.mockClear();
  });

  it('appends one script with the key and the language, whatever the number of calls', async () => {
    const { loadYmaps } = await freshLoader();
    const first = loadYmaps('the-key');
    const second = loadYmaps('the-key');
    expect(second).toBe(first);
    expect(scripts).toHaveLength(1);
    const url = new URL(scripts[0]?.src ?? '');
    expect(`${url.origin}${url.pathname}`).toBe('https://api-maps.yandex.ru/v3/');
    expect(url.searchParams.get('apikey')).toBe('the-key');
    expect(url.searchParams.get('lang')).toBe('ru_RU');

    loaded(scripts[0]);
    const components = await first;
    expect(ymaps3.import).toHaveBeenCalledWith('@yandex/ymaps3-reactify');
    expect(components.map).toEqual({ reactified: ymaps3 });
    expect(components.clusterByGrid).toBe(clusterByGrid);

    await loadYmaps('the-key');
    expect(scripts).toHaveLength(1);
  });

  it('rejects when the script fails, removes the tag and tries again on the next call', async () => {
    const { loadYmaps } = await freshLoader();
    const failed = loadYmaps('the-key');
    const remove = vi.spyOn(scripts[0] as HTMLScriptElement, 'remove');
    scripts[0]?.dispatchEvent(new Event('error'));
    await expect(failed).rejects.toThrow('Yandex Maps did not load');
    expect(remove).toHaveBeenCalled();

    const retry = loadYmaps('the-key');
    expect(scripts).toHaveLength(2);
    loaded(scripts[1]);
    await expect(retry).resolves.toMatchObject({ clusterByGrid });
  });

  it('adds no second script when ymaps3 is already there', async () => {
    vi.stubGlobal('ymaps3', ymaps3);
    const { loadYmaps } = await freshLoader();
    await expect(loadYmaps('the-key')).resolves.toMatchObject({ clusterByGrid });
    expect(scripts).toHaveLength(0);
  });

  it('fails after the timeout when the script never answers, and tries again later', async () => {
    vi.useFakeTimers();
    const { loadYmaps, LOAD_TIMEOUT_MS } = await freshLoader();
    const stuck = loadYmaps('the-key');
    const rejected = expect(stuck).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS - 1);
    expect(scripts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;

    void loadYmaps('the-key').catch(() => undefined);
    expect(scripts).toHaveLength(2);
  });
});
