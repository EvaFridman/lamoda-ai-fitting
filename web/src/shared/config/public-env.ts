// Browser-safe settings. NEXT_PUBLIC_* values are inlined into the bundle at build time (one image
// per environment), so each is read by a literal property access.

/**
 * Mixpanel's project token: public by design. Only images published from `main` get it; empty
 * (development, `npm run verify`, pull requests' images) turns analytics off.
 */
export const mixpanelToken = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN ?? '';

export const analyticsEnabled = mixpanelToken !== '';

/** The browser's Sentry DSN; empty turns browser reports off. Its origin is in the CSP. */
export const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';

/**
 * Yandex Maps' JavaScript API key (spec 0022 X13): public, the browser sees it anyway, and Yandex
 * accepts it only from the site's and localhost's pages (its HTTP Referer restriction). Only images
 * published from `main` get it; empty (tests, `npm run verify`, pull requests' images, a local copy
 * with none) shows a placeholder in the map's place.
 */
export const yandexMapsApiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? '';
