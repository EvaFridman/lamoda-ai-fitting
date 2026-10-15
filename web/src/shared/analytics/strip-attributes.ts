// The SDK's own click events for heatmaps (`$mp_click`, `$mp_dead_click`, `$mp_rage_click`) carry
// the attributes of the clicked element and its ancestors (`title`, `aria-label`, `href`, `name`,
// `id`), which recording masks do not touch. They are dropped before sending; tag, classes and
// position are what heatmaps need (spec 0008 J28).

type Properties = Record<string, unknown>;

// Keys of an element in `$elements` and `$target` that are kept.
const ELEMENT_KEYS = new Set(['$classes', '$tag_name', '$nth_child', '$nth_of_type']);
// Event keys copied from the target's attributes, id or text.
const DROPPED = /^\$el_(attr__|id$|text$)/;

function stripElement(element: unknown): unknown {
  if (typeof element !== 'object' || element === null) return element;
  return Object.fromEntries(Object.entries(element).filter(([key]) => ELEMENT_KEYS.has(key)));
}

/** The `on_track` hook: runs on every event the SDK sends, ours and its own. */
export function stripAttributes(name: string, properties: Properties): [string, Properties] {
  const kept: Properties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (DROPPED.test(key)) continue;
    if (key === '$elements' && Array.isArray(value)) kept[key] = value.map(stripElement);
    else if (key === '$target') kept[key] = stripElement(value);
    else kept[key] = value;
  }
  return [name, kept];
}
