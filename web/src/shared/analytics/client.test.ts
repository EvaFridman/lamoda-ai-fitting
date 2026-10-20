import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// What the SDK's storage holds as `$user_id`: identify sets it, reset clears it.
let storedUserId: string | undefined;

const sdk = {
  get_property: vi.fn((name: string) => (name === '$user_id' ? storedUserId : undefined)),
  init: vi.fn(),
  track: vi.fn(),
  track_pageview: vi.fn(),
  opt_in_tracking: vi.fn(),
  opt_out_tracking: vi.fn(),
  has_opted_out_tracking: vi.fn(() => false),
  start_session_recording: vi.fn(),
  stop_session_recording: vi.fn(),
  identify: vi.fn((id: string) => {
    storedUserId = id;
  }),
  reset: vi.fn(() => {
    storedUserId = undefined;
  }),
};

type Client = typeof import('./client');

async function load(token: string, importFails = false): Promise<Client> {
  vi.resetModules();
  vi.doMock('@/shared/config', () => ({ analyticsEnabled: token !== '', mixpanelToken: token }));
  if (importFails) {
    vi.doMock('mixpanel-browser', () => {
      throw new Error('blocked');
    });
  } else {
    vi.doMock('mixpanel-browser', () => ({ default: sdk }));
  }
  return import('./client');
}

describe('analytics client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedUserId = undefined;
    sdk.has_opted_out_tracking.mockReturnValue(false);
  });

  it('does not load or init the SDK with an empty token, and track is a no-op', async () => {
    const client = await load('');
    await client.startAnalytics();
    client.track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.track).not.toHaveBeenCalled();
  });

  it('track before start is a no-op', async () => {
    const client = await load('tok');
    client.track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.track).not.toHaveBeenCalled();
  });

  it('inits once with the token and privacy options, also for concurrent starts', async () => {
    const client = await load('tok');
    await Promise.all([client.startAnalytics(), client.startAnalytics()]);
    await client.startAnalytics();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({
        api_host: 'https://api-eu.mixpanel.com',
        persistence: 'localStorage',
        track_pageview: 'url-with-path',
        autocapture: false,
        ip: true,
        record_sessions_percent: 100,
        record_heatmap_data: true,
        record_mask_all_text: true,
        record_mask_all_inputs: true,
        record_block_selector:
          'img, picture, video, audio, canvas, svg image, iframe, object, embed, [style*="url("], ' +
          'link[as="image"], input[type="image"], meta[property^="og:image"]',
        record_console: false,
        record_network: false,
      }),
    );
    const { stripAttributes } = await import('./strip-attributes');
    const options = sdk.init.mock.calls[0]?.[1] as { hooks: { on_track: unknown } };
    expect(options.hooks.on_track).toBe(stripAttributes);
  });

  it('uses a block selector that is valid and matches image-like elements', async () => {
    const client = await load('tok');
    await client.startAnalytics();
    const options = sdk.init.mock.calls[0]?.[1] as { record_block_selector: string };
    const selector = options.record_block_selector;

    const make = (tag: string, attrs: Record<string, string> = {}) => {
      const el = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
      return el;
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const svgImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    svg.append(svgImage);

    expect(() => document.createElement('div').matches(selector)).not.toThrow();
    for (const el of [
      make('img'),
      make('picture'),
      make('video'),
      make('canvas'),
      make('iframe'),
      svgImage,
      make('div', { style: 'background-image:url(x)' }),
      make('link', { rel: 'preload', as: 'image' }),
      make('input', { type: 'image' }),
      make('meta', { property: 'og:image' }),
    ]) {
      expect(el.matches(selector), el.outerHTML).toBe(true);
    }
    for (const el of [make('div'), make('button'), make('link', { rel: 'stylesheet' })]) {
      expect(el.matches(selector), el.outerHTML).toBe(false);
    }
  });

  it('sends events through the SDK after start', async () => {
    const client = await load('tok');
    await client.startAnalytics();
    client.track('Element Hovered', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.track).toHaveBeenCalledWith('Element Hovered', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
  });

  it('does not opt in when the SDK is not opted out', async () => {
    const client = await load('tok');
    await client.startAnalytics();
    expect(sdk.opt_in_tracking).not.toHaveBeenCalled();
  });

  it('opts in without an $opt_in event when a stored opt-out is found at first start', async () => {
    sdk.has_opted_out_tracking.mockReturnValue(true);
    const client = await load('tok');
    await client.startAnalytics();
    expect(sdk.opt_in_tracking).toHaveBeenCalledWith({ track: expect.any(Function) });
    expect(sdk.start_session_recording).toHaveBeenCalledTimes(1);
    expect(sdk.track_pageview).toHaveBeenCalledTimes(1);
    client.track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.track).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the SDK import fails', async () => {
    const client = await load('tok', true);
    await expect(client.startAnalytics()).resolves.toBeUndefined();
    client.track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.track).not.toHaveBeenCalled();
  });

  it('does not throw when init throws', async () => {
    sdk.init.mockImplementationOnce(() => {
      throw new Error('init failed');
    });
    const client = await load('tok');
    await expect(client.startAnalytics()).resolves.toBeUndefined();
    client.track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.track).not.toHaveBeenCalled();
  });

  it('stop shuts the SDK down and track becomes a no-op', async () => {
    const client = await load('tok');
    await client.startAnalytics();
    client.stopAnalytics();
    expect(sdk.stop_session_recording).toHaveBeenCalledTimes(1);
    expect(sdk.opt_out_tracking).toHaveBeenCalledTimes(1);
    client.track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.track).not.toHaveBeenCalled();
  });

  it('stop before any start does nothing', async () => {
    const client = await load('tok');
    client.stopAnalytics();
    expect(sdk.stop_session_recording).not.toHaveBeenCalled();
    expect(sdk.opt_out_tracking).not.toHaveBeenCalled();
  });

  describe('clearing the SDK storage (J32)', () => {
    const deleteDatabase = vi.fn();

    beforeEach(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      vi.stubGlobal('indexedDB', { deleteDatabase });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    it('with no SDK initialized, removes mp_ and __mp keys from both storages and deletes both databases', async () => {
      window.localStorage.setItem('mp_abc_mixpanel', '1');
      window.localStorage.setItem('__mpq_abc', '1');
      window.localStorage.setItem('cookie-consent', 'keep');
      window.sessionStorage.setItem('mp_session', '1');
      window.sessionStorage.setItem('__mps', '1');
      window.sessionStorage.setItem('other', 'keep');
      const client = await load('tok');
      client.stopAnalytics();
      expect(window.localStorage.length).toBe(1);
      expect(window.localStorage.getItem('cookie-consent')).toBe('keep');
      expect(window.sessionStorage.length).toBe(1);
      expect(window.sessionStorage.getItem('other')).toBe('keep');
      expect(deleteDatabase).toHaveBeenCalledTimes(2);
      expect(deleteDatabase).toHaveBeenCalledWith('mixpanelBrowserDb');
      expect(deleteDatabase).toHaveBeenCalledWith('mixpanelFlagsDb');
      expect(sdk.opt_out_tracking).not.toHaveBeenCalled();
    });

    it('deletes both databases even when no SDK key was found', async () => {
      window.localStorage.setItem('other', 'keep');
      const client = await load('tok');
      client.stopAnalytics();
      expect(window.localStorage.getItem('other')).toBe('keep');
      expect(deleteDatabase).toHaveBeenCalledTimes(2);
      expect(deleteDatabase).toHaveBeenCalledWith('mixpanelBrowserDb');
      expect(deleteDatabase).toHaveBeenCalledWith('mixpanelFlagsDb');
    });

    it('keeps the SDK opt-in/out key while removing its other keys', async () => {
      window.localStorage.setItem('__mp_opt_in_out_x', '0');
      window.localStorage.setItem('mp_x', '1');
      window.localStorage.setItem('__mpq_x', '1');
      const client = await load('tok');
      client.stopAnalytics();
      expect(window.localStorage.getItem('__mp_opt_in_out_x')).toBe('0');
      expect(window.localStorage.getItem('mp_x')).toBeNull();
      expect(window.localStorage.getItem('__mpq_x')).toBeNull();
    });

    it('after start and stop opts out and leaves the storage alone, also on a second stop', async () => {
      const client = await load('tok');
      await client.startAnalytics();
      window.localStorage.setItem('mp_abc_mixpanel', 'opt-out');
      client.stopAnalytics();
      expect(sdk.opt_out_tracking).toHaveBeenCalledTimes(1);
      client.stopAnalytics();
      expect(window.localStorage.getItem('mp_abc_mixpanel')).toBe('opt-out');
      expect(deleteDatabase).not.toHaveBeenCalled();
    });

    it('does not throw when the storage throws', async () => {
      window.localStorage.setItem('mp_abc_mixpanel', '1');
      vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
        throw new Error('blocked');
      });
      const client = await load('tok');
      expect(() => client.stopAnalytics()).not.toThrow();
    });

    it('does not throw when removing a key or deleting a database throws', async () => {
      window.localStorage.setItem('mp_abc_mixpanel', '1');
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      deleteDatabase.mockImplementation(() => {
        throw new Error('blocked');
      });
      const client = await load('tok');
      expect(() => client.stopAnalytics()).not.toThrow();
    });
  });

  it('starts again after stop without a second init, opting back in', async () => {
    const client = await load('tok');
    await client.startAnalytics();
    client.stopAnalytics();
    sdk.has_opted_out_tracking.mockReturnValue(true);
    await client.startAnalytics();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.opt_in_tracking).toHaveBeenCalledWith({ track: expect.any(Function) });
    expect(sdk.start_session_recording).toHaveBeenCalledTimes(1);
    expect(sdk.track_pageview).toHaveBeenCalledTimes(1);
    client.track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.track).toHaveBeenCalledTimes(1);
  });

  it('never initializes the SDK when stop is called while it is still loading', async () => {
    const client = await load('tok');
    const started = client.startAnalytics();
    client.stopAnalytics();
    await started;
    for (const method of Object.values(sdk)) expect(method).not.toHaveBeenCalled();
    client.track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.track).not.toHaveBeenCalled();
  });

  it('initializes once and sends when started again after a stop during the load', async () => {
    const client = await load('tok');
    const started = client.startAnalytics();
    client.stopAnalytics();
    await started;
    await client.startAnalytics();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    client.track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.track).toHaveBeenCalledTimes(1);
  });

  it('calls init once for concurrent starts when it throws', async () => {
    sdk.init.mockImplementationOnce(() => {
      throw new Error('init failed');
    });
    const client = await load('tok');
    await Promise.all([client.startAnalytics(), client.startAnalytics()]);
    await client.startAnalytics();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    client.track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.track).not.toHaveBeenCalled();
  });

  describe('identity of a signed-in user (spec 0013 N13)', () => {
    it('sends nothing for identify before the SDK has started', async () => {
      const client = await load('tok');
      client.identify('u1');
      expect(sdk.identify).not.toHaveBeenCalled();
      expect(sdk.track).not.toHaveBeenCalled();
    });

    it('identifies by the id alone once the SDK has started, and when it is already running', async () => {
      const client = await load('tok');
      client.identify('u1');
      await client.startAnalytics();
      expect(sdk.identify).toHaveBeenCalledExactlyOnceWith('u1');
      client.identify('u2');
      expect(sdk.reset).toHaveBeenCalledTimes(1);
      expect(sdk.identify).toHaveBeenLastCalledWith('u2');
      expect(sdk.reset.mock.invocationCallOrder[0]).toBeLessThan(
        sdk.identify.mock.invocationCallOrder[1] ?? 0,
      );
      expect(sdk.track).not.toHaveBeenCalled();
    });

    it('identifies again at a restart after stop', async () => {
      const client = await load('tok');
      await client.startAnalytics();
      client.identify('u1');
      client.stopAnalytics();
      await client.startAnalytics();
      expect(sdk.identify).toHaveBeenCalledTimes(2);
      expect(sdk.identify).toHaveBeenLastCalledWith('u1');
    });

    it('sends Signed In once, after identify, when consent is wanted but the SDK still loads', async () => {
      const client = await load('tok');
      const started = client.startAnalytics();
      client.identify('u1', { signedIn: true });
      expect(sdk.identify).not.toHaveBeenCalled();
      await started;
      expect(sdk.identify).toHaveBeenCalledExactlyOnceWith('u1');
      expect(sdk.track).toHaveBeenCalledExactlyOnceWith('Signed In', {});
      expect(sdk.identify.mock.invocationCallOrder[0]).toBeLessThan(
        sdk.track.mock.invocationCallOrder[0] ?? 0,
      );
      await client.startAnalytics();
      client.identify('u1');
      client.identify('u1', { signedIn: false });
      expect(sdk.track).toHaveBeenCalledTimes(1);
    });

    it('sends Signed In at once when the SDK is already running', async () => {
      const client = await load('tok');
      await client.startAnalytics();
      client.identify('u1', { signedIn: true });
      expect(sdk.identify).toHaveBeenCalledExactlyOnceWith('u1');
      expect(sdk.track).toHaveBeenCalledExactlyOnceWith('Signed In', {});
    });

    it('does not send Signed In for a sign-in seen before any start, only the identity later', async () => {
      const client = await load('tok');
      client.identify('u1', { signedIn: true });
      await client.startAnalytics();
      expect(sdk.identify).toHaveBeenCalledExactlyOnceWith('u1');
      expect(sdk.track).not.toHaveBeenCalled();
    });

    it('drops a pending Signed In when analytics is stopped', async () => {
      const client = await load('tok');
      const started = client.startAnalytics();
      client.identify('u1', { signedIn: true });
      client.stopAnalytics();
      await started;
      await client.startAnalytics();
      expect(sdk.track).not.toHaveBeenCalled();
      expect(sdk.identify).toHaveBeenCalledExactlyOnceWith('u1');
    });

    it('calls nothing with an empty token', async () => {
      const client = await load('');
      await client.startAnalytics();
      client.identify('u1', { signedIn: true });
      client.reset();
      expect(sdk.identify).not.toHaveBeenCalled();
      expect(sdk.reset).not.toHaveBeenCalled();
      expect(sdk.track).not.toHaveBeenCalled();
    });

    it('reset clears the SDK identity of an identified user, once', async () => {
      const client = await load('tok');
      await client.startAnalytics();
      client.identify('u1');
      client.reset();
      expect(sdk.reset).toHaveBeenCalledTimes(1);
      client.reset();
      expect(sdk.reset).toHaveBeenCalledTimes(1);
    });

    it('reset clears an identity the SDK kept from an earlier page load', async () => {
      storedUserId = 'old';
      const client = await load('tok');
      await client.startAnalytics();
      client.reset();
      expect(sdk.reset).toHaveBeenCalledTimes(1);
    });

    it('reset never resets the SDK of an anonymous visitor', async () => {
      const client = await load('tok');
      await client.startAnalytics();
      client.reset();
      client.reset();
      expect(sdk.reset).not.toHaveBeenCalled();
    });

    it('reset while the SDK loads resets at start, with a stored identity, and does not identify', async () => {
      storedUserId = 'old';
      const client = await load('tok');
      const started = client.startAnalytics();
      client.reset();
      expect(sdk.reset).not.toHaveBeenCalled();
      await started;
      expect(sdk.reset).toHaveBeenCalledTimes(1);
      expect(sdk.identify).not.toHaveBeenCalled();
    });

    it('reset while the SDK loads does not reset at start without a stored identity', async () => {
      const client = await load('tok');
      const started = client.startAnalytics();
      client.reset();
      await started;
      expect(sdk.reset).not.toHaveBeenCalled();
      expect(sdk.identify).not.toHaveBeenCalled();
    });

    it('reset before any start makes the first start reset a stored identity, not identify', async () => {
      storedUserId = 'old';
      const client = await load('tok');
      client.identify('u1');
      client.reset();
      await client.startAnalytics();
      expect(sdk.identify).not.toHaveBeenCalled();
      expect(sdk.reset).toHaveBeenCalledTimes(1);
    });

    it('reset before any start, with no stored identity, starts without identify or reset', async () => {
      const client = await load('tok');
      client.identify('u1');
      client.reset();
      await client.startAnalytics();
      expect(sdk.identify).not.toHaveBeenCalled();
      expect(sdk.reset).not.toHaveBeenCalled();
    });

    it('identify after reset, before start, resets a different stored identity and then identifies', async () => {
      storedUserId = 'old';
      const client = await load('tok');
      client.reset();
      client.identify('u2');
      await client.startAnalytics();
      expect(sdk.reset).toHaveBeenCalledTimes(1);
      expect(sdk.identify).toHaveBeenCalledExactlyOnceWith('u2');
      expect(sdk.reset.mock.invocationCallOrder[0]).toBeLessThan(
        sdk.identify.mock.invocationCallOrder[0] ?? 0,
      );
    });

    it('identify after reset, before start, does not reset when the stored id is the same', async () => {
      storedUserId = 'u2';
      const client = await load('tok');
      client.reset();
      client.identify('u2');
      await client.startAnalytics();
      expect(sdk.reset).not.toHaveBeenCalled();
      expect(sdk.identify).toHaveBeenCalledExactlyOnceWith('u2');
    });

    it('resets a stored identity of another user before identifying at start', async () => {
      storedUserId = 'A';
      const client = await load('tok');
      client.identify('B');
      await client.startAnalytics();
      expect(sdk.reset).toHaveBeenCalledTimes(1);
      expect(sdk.identify).toHaveBeenCalledExactlyOnceWith('B');
      expect(sdk.reset.mock.invocationCallOrder[0]).toBeLessThan(
        sdk.identify.mock.invocationCallOrder[0] ?? 0,
      );
    });

    it('does not reset when the stored identity is the same user', async () => {
      storedUserId = 'A';
      const client = await load('tok');
      client.identify('A');
      await client.startAnalytics();
      expect(sdk.reset).not.toHaveBeenCalled();
      expect(sdk.identify).toHaveBeenCalledExactlyOnceWith('A');
    });

    it('does not reset when the SDK stores no identity', async () => {
      const client = await load('tok');
      client.identify('A');
      await client.startAnalytics();
      expect(sdk.reset).not.toHaveBeenCalled();
    });

    it('reset drops a pending Signed In', async () => {
      const client = await load('tok');
      const started = client.startAnalytics();
      client.identify('u1', { signedIn: true });
      client.reset();
      await started;
      expect(sdk.track).not.toHaveBeenCalled();
      expect(sdk.identify).not.toHaveBeenCalled();
    });

    it('reset without a user or an SDK does nothing and does not throw', async () => {
      const client = await load('tok');
      expect(() => client.reset()).not.toThrow();
      client.identify('u1');
      expect(() => client.reset()).not.toThrow();
      expect(sdk.reset).not.toHaveBeenCalled();
    });
  });

  it('does not retry after init threw', async () => {
    sdk.init.mockImplementationOnce(() => {
      throw new Error('init failed');
    });
    const client = await load('tok');
    await client.startAnalytics();
    await client.startAnalytics();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    client.track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    expect(sdk.track).not.toHaveBeenCalled();
  });
});
