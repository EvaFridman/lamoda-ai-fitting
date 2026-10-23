import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The tab's memory of a step lives in the module: each test loads a fresh copy (and so a fresh
// `track` mock).
let CatalogBack: typeof import('./catalog-back').CatalogBack;
let track: typeof import('@/shared/analytics/client').track;

const nav = vi.hoisted(() => ({ pathname: '/catalog', back: vi.fn() }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ back: nav.back, replace: vi.fn(), push: vi.fn() }),
  usePathname: () => nav.pathname,
}));
vi.mock('@/shared/analytics/client', () => ({ track: vi.fn() }));

beforeEach(async () => {
  vi.resetModules();
  ({ CatalogBack } = await import('./catalog-back'));
  ({ track } = await import('@/shared/analytics/client'));
  nav.back.mockClear();
  nav.pathname = '/catalog';
  documentLoadedAt('/catalog');
  referrer('');
  historyLength(1);
});

afterEach(() => {
  // Unmount while the stub is still there: the cleanup reads `window.navigation`.
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'referrer');
  Reflect.deleteProperty(window.history, 'length');
  Reflect.deleteProperty(window, 'navigation');
});

function navigationEntry(entry: { index: number } | null) {
  Object.defineProperty(window, 'navigation', {
    value: { currentEntry: entry, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    configurable: true,
  });
}

// A Navigation API whose current entry changes and tells it, as the browser's does.
function liveNavigation(startIndex: number) {
  const events = new EventTarget();
  const state = { entry: { index: startIndex } };
  const add = vi.fn((type: string, listener: EventListener) =>
    events.addEventListener(type, listener),
  );
  const remove = vi.fn((type: string, listener: EventListener) =>
    events.removeEventListener(type, listener),
  );
  Object.defineProperty(window, 'navigation', {
    value: {
      get currentEntry() {
        return state.entry;
      },
      addEventListener: add,
      removeEventListener: remove,
    },
    configurable: true,
  });
  return {
    add,
    remove,
    moveTo(index: number) {
      state.entry = { index };
      events.dispatchEvent(new Event('currententrychange'));
    },
  };
}

// A tab opened from a link starts with one entry; a tab that was used has more.
function historyLength(value: number) {
  Object.defineProperty(window.history, 'length', { value, configurable: true });
}

function documentLoadedAt(path: string) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { type: 'navigate', name: `${window.location.origin}${path}` } as PerformanceNavigationTiming,
  ]);
}

function referrer(value: string) {
  Object.defineProperty(document, 'referrer', { value, configurable: true });
}

describe('CatalogBack', () => {
  it('is a link to /catalog on a category page opened directly', () => {
    nav.pathname = '/catalog/dresses';
    documentLoadedAt('/catalog/dresses');
    render(<CatalogBack />);
    expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute('href', '/catalog');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is a link on a category page entered from another site', () => {
    nav.pathname = '/catalog/dresses';
    documentLoadedAt('/catalog/dresses');
    referrer('https://example.com/search');
    render(<CatalogBack />);
    expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute('href', '/catalog');
  });

  it('is a button that goes back after a reload of a page the site linked to', () => {
    nav.pathname = '/catalog/dresses';
    documentLoadedAt('/catalog/dresses');
    referrer(`${window.location.origin}/catalog`);
    historyLength(2);
    render(<CatalogBack />);
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(nav.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('is a link on a category opened in a new tab from a link of this site (one history entry)', () => {
    nav.pathname = '/catalog/dresses';
    documentLoadedAt('/catalog/dresses');
    referrer(`${window.location.origin}/customer`);
    historyLength(1);
    render(<CatalogBack />);
    expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute('href', '/catalog');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows no arrow on /catalog opened in a new tab from a link of this site', () => {
    referrer(`${window.location.origin}/catalog/dresses`);
    historyLength(1);
    render(<CatalogBack />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is a button on /catalog with a referrer of this site and more than one history entry', () => {
    referrer(`${window.location.origin}/catalog/dresses`);
    historyLength(3);
    render(<CatalogBack />);
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
  });

  it('keeps the link when the filters change on a directly opened category', () => {
    nav.pathname = '/catalog/dresses';
    documentLoadedAt('/catalog/dresses');
    historyLength(1);
    const view = render(<CatalogBack />);
    // A filter's router.replace keeps the path and the history length.
    view.rerender(<CatalogBack />);
    historyLength(1);
    view.rerender(<CatalogBack />);
    expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute('href', '/catalog');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is a button on a category the tab stepped to from /customer', () => {
    documentLoadedAt('/customer');
    nav.pathname = '/catalog/dresses';
    historyLength(2);
    render(<CatalogBack />);
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows no arrow on /catalog opened directly, but keeps the slot', () => {
    const { container } = render(<CatalogBack />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.firstChild).toBeInTheDocument();
  });

  it('shows no arrow on /catalog after the redirect from / (empty referrer, document at /catalog)', () => {
    documentLoadedAt('/catalog');
    referrer('');
    render(<CatalogBack />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows no arrow on /catalog entered from another site', () => {
    referrer('https://example.com/');
    render(<CatalogBack />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('goes back in the history on a page the tab stepped to before it mounted', () => {
    documentLoadedAt('/customer');
    nav.pathname = '/catalog/dresses';
    render(<CatalogBack />);
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
  });

  it('goes back on /catalog too after a step', () => {
    documentLoadedAt('/customer');
    render(<CatalogBack />);
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
  });

  it('keeps the history button once the tab has stepped, after returning to the loaded path', () => {
    documentLoadedAt('/catalog/dresses');
    nav.pathname = '/catalog/skirts';
    const view = render(<CatalogBack />);
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();

    nav.pathname = '/catalog/dresses';
    view.rerender(<CatalogBack />);
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
  });

  it('does not take a change of the filters (same path) for a step', () => {
    nav.pathname = '/catalog/dresses';
    documentLoadedAt('/catalog/dresses');
    const view = render(<CatalogBack />);
    view.rerender(<CatalogBack />);
    expect(screen.getByRole('link', { name: 'Назад' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('gives the link where the browser keeps no navigation entry and the referrer is empty', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    nav.pathname = '/catalog/dresses';
    render(<CatalogBack />);
    expect(screen.getByRole('link', { name: 'Назад' })).toBeInTheDocument();
  });

  describe('with the Navigation API', () => {
    it('is a button on a directly opened category once the entry index is 1', () => {
      nav.pathname = '/catalog/dresses';
      documentLoadedAt('/catalog/dresses');
      navigationEntry({ index: 1 });
      render(<CatalogBack />);
      fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
      expect(nav.back).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('is a link at index 0 after a step, back on the document first entry', () => {
      documentLoadedAt('/catalog/a');
      nav.pathname = '/catalog/b';
      const view = render(<CatalogBack />);
      expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();

      nav.pathname = '/catalog/a';
      navigationEntry({ index: 0 });
      referrer(`${window.location.origin}/customer`);
      historyLength(3);
      view.rerender(<CatalogBack />);
      expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute('href', '/catalog');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('shows no arrow at index 0 on /catalog, whatever the step and the referrer', () => {
      documentLoadedAt('/customer');
      referrer(`${window.location.origin}/catalog/dresses`);
      historyLength(3);
      navigationEntry({ index: 0 });
      render(<CatalogBack />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('reads the index again on currententrychange: the link becomes the history button', async () => {
      nav.pathname = '/catalog/dresses';
      documentLoadedAt('/catalog/dresses');
      const navigation = liveNavigation(0);
      render(<CatalogBack />);
      expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute('href', '/catalog');

      await act(async () => navigation.moveTo(1));
      fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
      expect(nav.back).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('defers the update of currententrychange by a microtask (Next fires it inside an insertion effect)', async () => {
      nav.pathname = '/catalog/dresses';
      documentLoadedAt('/catalog/dresses');
      const navigation = liveNavigation(0);
      render(<CatalogBack />);

      navigation.moveTo(1);
      expect(screen.getByRole('link', { name: 'Назад' })).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();

      await act(async () => {});
      expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('removes its currententrychange listener on unmount', () => {
      nav.pathname = '/catalog/dresses';
      documentLoadedAt('/catalog/dresses');
      const navigation = liveNavigation(0);
      const view = render(<CatalogBack />);
      expect(navigation.add).toHaveBeenCalledWith('currententrychange', expect.any(Function));
      const listener = navigation.add.mock.calls[0]?.[1];

      view.unmount();
      expect(navigation.remove).toHaveBeenCalledWith('currententrychange', listener);
    });

    it('falls back to the old rule (a step) when there is no current entry', () => {
      documentLoadedAt('/customer');
      nav.pathname = '/catalog/dresses';
      navigationEntry(null);
      render(<CatalogBack />);
      expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    });

    it('falls back to the old rule (no step) when there is no current entry', () => {
      nav.pathname = '/catalog/dresses';
      documentLoadedAt('/catalog/dresses');
      navigationEntry(null);
      render(<CatalogBack />);
      expect(screen.getByRole('link', { name: 'Назад' })).toBeInTheDocument();
    });
  });

  describe('server render', () => {
    it('is the link on a category page', () => {
      nav.pathname = '/catalog/dresses';
      const html = renderToString(<CatalogBack />);
      expect(html).toContain('href="/catalog"');
      expect(html).toContain('aria-label="Назад"');
      expect(html).not.toContain('<button');
    });

    it('is the slot alone on /catalog', () => {
      const html = renderToString(<CatalogBack />);
      expect(html).not.toContain('<a');
      expect(html).not.toContain('<button');
      expect(html).toContain('<div');
    });
  });

  describe('analytics', () => {
    it('sends the history target and goes back when the button is clicked', () => {
      documentLoadedAt('/customer');
      render(<CatalogBack />);
      fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith('Element Clicked', {
        element: 'catalog.back',
        zone: 'catalog',
        type: 'navigation',
        target: 'history',
      });
      expect(nav.back).toHaveBeenCalledTimes(1);
    });

    it('sends the catalog target when the link is clicked', () => {
      nav.pathname = '/catalog/dresses';
      documentLoadedAt('/catalog/dresses');
      render(<CatalogBack />);
      const link = screen.getByRole('link', { name: 'Назад' });
      // jsdom does not navigate.
      link.addEventListener('click', (event) => event.preventDefault());
      fireEvent.click(link);
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith('Element Clicked', {
        element: 'catalog.back',
        zone: 'catalog',
        type: 'navigation',
        target: 'catalog',
      });
      expect(nav.back).not.toHaveBeenCalled();
    });
  });
});
