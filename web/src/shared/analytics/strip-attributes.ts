// The SDK's own click events for heatmaps (`$mp_click`, `$mp_dead_click`, `$mp_rage_click`) carry
// the attributes of the clicked element and its ancestors (`title`, `aria-label`, `href`, `name`,
// `id`), which recording masks do not touch. They are dropped before sending; tag, classes and
// position are what heatmaps need (spec 0008 J28). The page's address in every event loses the
// search text (`q`, spec 0014 O104) and the id of a user's fitting (`fitting`, spec 0019 A77).

type Properties = Record<string, unknown>;

// Keys of an element in `$elements` and `$target` that are kept.
const ELEMENT_KEYS = new Set(['$classes', '$tag_name', '$nth_child', '$nth_of_type']);
// Event keys copied from the target's attributes, id or text, and the search keyword the SDK reads
// from a referrer it takes for a search engine: its pattern also matches our catalog's address
// with "google" in `q` (O104), and real engines send no query.
const DROPPED = /^(\$el_(attr__|id$|text$)|mp_keyword$)/;
// The addresses the SDK adds to an event, and the query of the page view's address.
const URL_KEYS = new Set(['$current_url', '$referrer', '$initial_referrer']);
const SEARCH_KEY = 'current_url_search';
// The catalog's search parameter, and the fitting a link opens (its id names a user's photo).
const STRIPPED_PARAMS = ['q', 'fitting'] as const;

function hasStripped(params: URLSearchParams): boolean {
  return STRIPPED_PARAMS.some((name) => params.has(name));
}

function stripElement(element: unknown): unknown {
  if (typeof element !== 'object' || element === null) return element;
  return Object.fromEntries(Object.entries(element).filter(([key]) => ELEMENT_KEYS.has(key)));
}

// The query without `q` and `fitting`, with its `?` when anything is left.
function stripSearch(search: string): string {
  const params = new URLSearchParams(search);
  if (!hasStripped(params)) return search;
  for (const name of STRIPPED_PARAMS) params.delete(name);
  const rest = params.toString();
  return rest === '' ? '' : `?${rest}`;
}

// An address without `q`, `fitting` and its fragment (the site uses none, a link sent by someone else
// may carry text there); anything that is not an absolute address (`$direct`) stays as it is.
function stripUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (!hasStripped(url.searchParams) && url.hash === '') return value;
  url.search = stripSearch(url.search);
  url.hash = '';
  return url.toString();
}

// The part of the SDK `stripStoredReferrer` uses.
interface SuperProperties {
  get_property(name: string): unknown;
  register(properties: Properties): void;
}

/**
 * The `loaded` callback: the referrer the SDK keeps for good (`register_once`) loses `q` where it
 * is stored, before the SDK queues it for the profile (`set_once`). A queued people request taken
 * up by another tab is sent without `before_send_people`, so the hook alone is not enough.
 */
export function stripStoredReferrer(mixpanel: SuperProperties): void {
  const stored = mixpanel.get_property('$initial_referrer');
  const stripped = stripUrl(stored);
  if (stripped !== stored) mixpanel.register({ $initial_referrer: stripped });
}

/**
 * The `before_send_people` hook: a profile update (`$initial_referrer` by `set_once` on load,
 * sent after `identify`) does not pass `on_track`, so its addresses lose `q` here.
 */
export function stripPeopleAddresses(data: Properties): Properties {
  const kept: Properties = { ...data };
  for (const operation of ['$set', '$set_once']) {
    const values = data[operation];
    if (typeof values !== 'object' || values === null) continue;
    kept[operation] = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        URL_KEYS.has(key) ? stripUrl(value) : value,
      ]),
    );
  }
  return kept;
}

/** The `on_track` hook: runs on every event the SDK sends, ours and its own. */
export function stripAttributes(name: string, properties: Properties): [string, Properties] {
  const kept: Properties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (DROPPED.test(key)) continue;
    if (key === '$elements' && Array.isArray(value)) kept[key] = value.map(stripElement);
    else if (key === '$target') kept[key] = stripElement(value);
    else if (URL_KEYS.has(key)) kept[key] = stripUrl(value);
    else if (key === SEARCH_KEY && typeof value === 'string') kept[key] = stripSearch(value);
    else kept[key] = value;
  }
  return [name, kept];
}
