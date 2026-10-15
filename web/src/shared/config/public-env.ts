// Browser-safe settings. NEXT_PUBLIC_* values are inlined into the bundle at build time (one image
// per environment), so each is read by a literal property access.

/**
 * Mixpanel's project token: public by design. Only images published from `main` get it; empty
 * (development, `npm run verify`, pull requests' images) turns analytics off.
 */
export const mixpanelToken = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN ?? '';

export const analyticsEnabled = mixpanelToken !== '';
