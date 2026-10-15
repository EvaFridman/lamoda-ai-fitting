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
}

/** Stops sending in this tab and clears the SDK's storage (J16). */
export function stopAnalytics(): void {
  wanted = false;
  if (active === undefined) return;
  active.stop_session_recording();
  active.opt_out_tracking();
  active = undefined;
}

/** Sends a listed event; a no-op until analytics has started, so callers need no checks. */
export function track<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEvents[Name],
): void {
  active?.track(name, properties);
}
