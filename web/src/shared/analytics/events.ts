// Every analytics event and its properties (spec 0008 AC9): sending anything else fails
// `npm run typecheck`. Page views are Mixpanel's own `$mp_web_page_view`, sent by the SDK.

/** Every element that sends click and hover events; page specs add theirs (spec 0008 J7). */
export type TrackedElement =
  | 'ui-kit.button-primary'
  // The login modal's "Войти через Google" and the profile menu's sign-outs (spec 0013 N13).
  | 'login.google'
  | 'profile-menu.sign-out'
  | 'profile-menu.sign-out-everywhere';

// Sign-in events carry no properties: the user is known only by the id `identify` gives (N13).
type NoProperties = Record<string, never>;

export type AnalyticsEvents = {
  'Element Clicked': { element: TrackedElement };
  'Element Hovered': { element: TrackedElement };
  'Login Opened': NoProperties;
  'Signed In': NoProperties;
  'Signed Out': NoProperties;
};

export type AnalyticsEventName = keyof AnalyticsEvents;
