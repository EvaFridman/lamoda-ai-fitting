// Every analytics event and its properties (spec 0008 AC9): sending anything else fails
// `npm run typecheck`. Page views are Mixpanel's own `$mp_web_page_view`, sent by the SDK.

/** Every element that sends click and hover events; page specs add theirs (spec 0008 J7). */
export type TrackedElement = 'ui-kit.button-primary';

export type AnalyticsEvents = {
  'Element Clicked': { element: TrackedElement };
  'Element Hovered': { element: TrackedElement };
};

export type AnalyticsEventName = keyof AnalyticsEvents;
