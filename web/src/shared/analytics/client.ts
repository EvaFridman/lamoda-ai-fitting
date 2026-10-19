// The only module that imports `mixpanel-browser`, always through `import()`: the SDK (with its
// session recorder) is its own chunk, loaded only after consent (spec 0008 plan §1, §3).
import type { Config, Mixpanel } from 'mixpanel-browser';

import { analyticsEnabled, mixpanelToken } from '@/shared/config';

import type { AnalyticsEventName, AnalyticsEvents } from './events';
import { stripAttributes } from './strip-attributes';

const OPTIONS: Partial<Config> = {
  api_host: 'https://api-eu.mixpanel.com',
  persistence: 'localStorage',
  track_pageview: 'url-with-path',
  autocapture: false,
  ip: true,
  // Heatmaps are built only from recorded sessions (J6); everything a visitor sees or types is
  // masked, and images (fitting photos) are not recorded: elements and inline `url(...)` styles
  // (J29). Attributes are recorded as they are, and stylesheets' `url(...)` too.
  record_sessions_percent: 100,
  record_heatmap_data: true,
  record_mask_all_text: true,
  record_mask_all_inputs: true,
  // rrweb treats an invalid selector as "block nothing": a test checks that this one matches.
  record_block_selector:
    'img, picture, video, audio, canvas, svg image, iframe, object, embed, [style*="url("], ' +
    'link[as="image"], input[type="image"], meta[property^="og:image"]',
  record_canvas: false,
  record_console: false,
  record_network: false,
  hooks: { on_track: stripAttributes },
};

// One SDK load per tab, shared by every start (React runs effects twice in development). A failed
// load is not retried until the page reloads.
let loading: Promise<Mixpanel | undefined> | undefined;
// `init` runs once, by the first start that finds consent still given after the load; after it
// throws, analytics stays off in this tab, concurrent starts included.
let initialized = false;
let failed = false;
// The SDK once started and not stopped since; `track` sends only through it.
let active: Mixpanel | undefined;
// The last call: a `stopAnalytics()` during the load wins over the `startAnalytics()` before it,
// and the SDK is then never initialized.
let wanted = false;
// The signed-in user of this page, identified by every start (spec 0013 plan §10), and a sign-in
// that came back to it while consent was given, sent once the SDK has started.
let userId: string | undefined;
let signedIn = false;
// The page saw the visitor signed out: every start drops an identity the SDK still keeps, from a
// session that ended in another tab or browser, or expired (N13).
let signedOut = false;

async function load(): Promise<Mixpanel | undefined> {
  try {
    return (await import('mixpanel-browser')).default;
  } catch {
    // An ad blocker or a network error: analytics stays off and nothing is reported (J25).
    return undefined;
  }
}

/**
 * Loads and initializes the SDK once per tab and starts sending; call it once consent is given.
 * After `stopAnalytics()` or a decline stored by the SDK, it opts the SDK back in (J26). A no-op
 * with an empty token.
 */
export async function startAnalytics(): Promise<void> {
  if (!analyticsEnabled) return;
  wanted = true;
  loading ??= load();
  const mixpanel = await loading;
  if (mixpanel === undefined || failed || !wanted || active !== undefined) return;
  if (!initialized) {
    try {
      mixpanel.init(mixpanelToken, OPTIONS);
    } catch {
      failed = true; // J25, as a failed load
      return;
    }
    initialized = true;
  }
  // The SDK keeps an opt-out of an earlier decline; our consent store decides (J26). Do Not Track
  // still wins inside the SDK.
  if (mixpanel.has_opted_out_tracking()) {
    mixpanel.opt_in_tracking({ track: () => {} });
    mixpanel.start_session_recording();
    mixpanel.track_pageview();
  }
  active = mixpanel;
  if (signedOut) forgetIdentity();
  else sendIdentity();
}

// The user's id only, never the email or name (spec 0013 N13).
function sendIdentity(): void {
  if (active === undefined || userId === undefined) return;
  // Someone else's identity this page never saw end: `identify` would tie it to this user.
  const stored: unknown = active.get_property('$user_id');
  if (stored !== undefined && stored !== userId) active.reset();
  active.identify(userId);
  if (signedIn) {
    signedIn = false;
    active.track('Signed In', {});
  }
}

// `identify` keeps `$user_id` in the SDK's storage until `reset`; an anonymous visitor's SDK is not
// reset, or every page load would make it a new device.
function forgetIdentity(): void {
  if (active?.get_property('$user_id') !== undefined) active?.reset();
}

/**
 * Identifies the signed-in user now or at the next start, and with `signedIn` sends `Signed In`
 * after it. A sign-in seen without consent is not kept: a later consent sends only the identity.
 * Consent is known first: `AnalyticsGate` reads it as the page hydrates, the session comes later
 * from a request.
 */
export function identify(id: string, options: { signedIn?: boolean } = {}): void {
  userId = id;
  signedOut = false;
  if (options.signedIn && wanted) signedIn = true;
  sendIdentity();
}

/**
 * The visitor is signed out: forgets the user, and the SDK's identity with it now or at the next
 * start, wherever the session ended (spec 0013 N13). Without an identity it changes nothing.
 */
export function reset(): void {
  userId = undefined;
  signedIn = false;
  signedOut = true;
  forgetIdentity();
}

// What the SDK keeps in the browser: its storage keys and IndexedDB databases (the names in
// mixpanel-browser 2.84's source; check them when the SDK is updated).
const SDK_KEY_PREFIXES = ['mp_', '__mp'];
// The opt-out stays: it names no visitor, and an SDK still running in another tab reads it to stop
// sending after a decline there.
const SDK_OPT_OUT_PREFIX = '__mp_opt_in_out_';
const SDK_DATABASES = ['mixpanelBrowserDb', 'mixpanelFlagsDb'];

// Removes what an earlier start left when no SDK runs in this tab to opt out: an answer that
// expired, or a decline in a tab where the SDK never loaded (J32). Best effort: blocked storage
// holds nothing to clear. Deleting a database that does not exist costs nothing.
function clearSdkStorage(): void {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i) ?? '');
      for (const key of keys) {
        if (
          SDK_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
          !key.startsWith(SDK_OPT_OUT_PREFIX)
        ) {
          storage.removeItem(key);
        }
      }
    } catch {
      // storage blocked
    }
  }
  if (typeof indexedDB === 'undefined') return;
  for (const name of SDK_DATABASES) {
    try {
      indexedDB.deleteDatabase(name);
    } catch {
      // IndexedDB blocked
    }
  }
}

/**
 * Stops sending in this tab and clears the SDK's storage (J16); call it whenever there is no
 * consent. Without an SDK initialized in this tab, it clears what an earlier one left (J32).
 */
export function stopAnalytics(): void {
  wanted = false;
  signedIn = false;
  if (active !== undefined) {
    active.stop_session_recording();
    active.opt_out_tracking();
    active = undefined;
    return;
  }
  // An SDK initialized here and stopped already opted out; its opt-out must stay, or a later start
  // in this tab would not opt it back in (J26).
  if (!initialized) clearSdkStorage();
}

/** Sends a listed event; a no-op until analytics has started, so callers need no checks. */
export function track<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEvents[Name],
): void {
  active?.track(name, properties);
}
