import { describe, expect, it } from 'vitest';

import { BUDGET_THRESHOLD, estimateMonthly, MONTHLY_LIMIT } from './budget';
import { type Catalog, catalog, type Properties } from './catalog';

// The limits of spec 0015 (plan §5, AC7). A new entry in any list is the owner's decision (R16).
const ABBREVIATIONS = ['AI'];
// The last word of a phrasal verb's name, after the verb: `Signed In` (R24).
const PARTICLES = ['In', 'Out', 'Up', 'Off', 'Down'];
const IRREGULAR_PAST = [
  'Sent',
  'Shown',
  'Seen',
  'Made',
  'Done',
  'Chosen',
  'Taken',
  'Found',
  'Paid',
  'Bought',
];
const MAX_PROPERTIES = 5;
const MAX_ENUM_VALUES = 50;

const PROPERTY_NAME = /^[a-z]+(_[a-z]+)*$/;
const ELEMENT_ID = /^[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+(-[a-z0-9]+)*$/;
// `EVENTS.md` prints every zone key and area in backticks, used or not (R23).
const AREA = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// `EVENTS.md` prints each value in backticks inside a table (R21).
const ENUM_VALUE = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

function eventNameProblem(name: string): string | undefined {
  const words = name.split(' ');
  if (words.length < 2) return 'needs two or more words';
  const odd = words.find((word) => !/^[A-Z][a-z]+$/.test(word) && !ABBREVIATIONS.includes(word));
  if (odd !== undefined) return `"${odd}" is neither Title Case nor a listed abbreviation`;
  // "Object Action" ends in the verb, a phrasal verb in a particle after it (R8, R24).
  const isPast = (word: string) => word.endsWith('ed') || IRREGULAR_PAST.includes(word);
  const last = words.at(-1)!;
  const verb = PARTICLES.includes(last) ? words.at(-2)! : last;
  return isPast(verb) ? undefined : 'does not end in a verb in the past tense (and a particle)';
}

function propertyProblems(owner: string, properties: Properties = {}): string[] {
  const problems: string[] = [];
  const entries = Object.entries(properties);
  if (entries.length > MAX_PROPERTIES) {
    problems.push(`${owner}: ${entries.length} properties, at most ${MAX_PROPERTIES}`);
  }
  for (const [name, property] of entries) {
    if (!PROPERTY_NAME.test(name)) problems.push(`${owner}: property "${name}" is not snake_case`);
    if (property.kind !== 'enum') continue;
    const { values } = property;
    if (values.length > MAX_ENUM_VALUES) {
      problems.push(`${owner}.${name}: ${values.length} values, at most ${MAX_ENUM_VALUES}`);
    }
    if (new Set(values).size !== values.length) problems.push(`${owner}.${name}: duplicate values`);
    for (const value of values) {
      if (!ENUM_VALUE.test(value))
        problems.push(`${owner}.${name}: value "${value}" is off the pattern`);
    }
  }
  return problems;
}

/** Every broken limit of a catalog, empty for a good one. */
function catalogProblems(c: Catalog): string[] {
  const problems: string[] = [];

  for (const name of [...Object.keys(c.commonEvents), ...Object.keys(c.events)]) {
    const problem = eventNameProblem(name);
    if (problem !== undefined) problems.push(`event "${name}" ${problem}`);
  }
  for (const [name, event] of Object.entries(c.events)) {
    problems.push(...propertyProblems(`event "${name}"`, event.properties));
  }

  const zoneOfArea = new Map<string, string>();
  for (const [zone, { areas }] of Object.entries(c.zones)) {
    if (!AREA.test(zone)) problems.push(`zone "${zone}" is not kebab-case`);
    for (const area of areas) {
      if (!AREA.test(area)) problems.push(`area "${area}" is not kebab-case`);
      const other = zoneOfArea.get(area);
      if (other === undefined) zoneOfArea.set(area, zone);
      else problems.push(`area "${area}" belongs to zones "${other}" and "${zone}"`);
    }
  }
  for (const [id, element] of Object.entries(c.elements)) {
    if (!ELEMENT_ID.test(id)) problems.push(`element "${id}" is not area.element in kebab-case`);
    const area = id.split('.')[0] ?? '';
    if (!(c.zones[element.zone]?.areas ?? []).includes(area)) {
      problems.push(`element "${id}": "${area}" is not an area of zone "${element.zone}"`);
    }
    problems.push(...propertyProblems(`element "${id}"`, element.properties));
  }

  const used = new Set(
    [...Object.values(c.events), ...Object.values(c.elements)].map((e) => e.zone),
  );
  for (const zone of Object.keys(c.zones)) {
    if (!used.has(zone)) problems.push(`zone "${zone}" has no events or elements`);
  }

  // A negative estimate would hide the others from the budget below.
  const estimates: [string, number][] = [
    ['visitsPerMonth', c.visitsPerMonth],
    ['sdkPerVisit', c.sdkPerVisit],
    ...Object.entries(c.events).map(([name, event]): [string, number] => [
      `event "${name}" perVisit`,
      event.perVisit,
    ]),
    ...Object.entries(c.elements).flatMap(([id, element]): [string, number][] => [
      [`element "${id}" clicksPerVisit`, element.clicksPerVisit],
      [`element "${id}" hoversPerVisit`, element.hoversPerVisit],
    ]),
  ];
  for (const [what, value] of estimates) {
    if (!(value >= 0)) problems.push(`${what} is ${value}, not 0 or more`);
  }

  const perMonth = estimateMonthly(c).total.perMonth;
  const budget = MONTHLY_LIMIT * BUDGET_THRESHOLD;
  if (perMonth > budget) problems.push(`${perMonth} events a month, at most ${budget}`);

  return problems;
}

const enumOf = (values: readonly string[]) => ({ kind: 'enum', values }) as const;
const flag = { kind: 'boolean' } as const;
const withEvent = (name: string, properties: Properties = {}): Catalog => ({
  ...catalog,
  events: {
    ...catalog.events,
    [name]: { zone: 'auth', type: 'interaction', description: '', perVisit: 0, properties },
  },
});
const withElement = (id: string, zone: string, properties?: Properties): Catalog => ({
  ...catalog,
  elements: {
    ...catalog.elements,
    [id]: {
      zone,
      type: 'interaction',
      description: '',
      clicksPerVisit: 0,
      hoversPerVisit: 0,
      properties,
    },
  },
});

describe('analytics catalog limits', () => {
  it('keeps the catalog within every limit', () => {
    expect(catalogProblems(catalog)).toEqual([]);
  });

  it.each([
    'Login Opened',
    'Catalog Sorted',
    'Signed In',
    'Logged Out',
    'AI Fitting Started',
    'Photo Sent',
  ])('accepts the event name "%s"', (name) => {
    expect(catalogProblems(withEvent(name))).toEqual([]);
  });

  const notPast = 'does not end in a verb in the past tense (and a particle)';
  it.each([
    ['Login Open', notPast],
    ['Red Button', notPast],
    ['Opened Login', notPast],
    ['Login In', notPast],
    ['Signed In Twice', notPast],
    ['UI Opened', '"UI" is neither Title Case nor a listed abbreviation'],
    ['Opened', 'needs two or more words'],
    ['login opened', '"login" is neither Title Case nor a listed abbreviation'],
    ['Login  Opened', '"" is neither Title Case nor a listed abbreviation'],
  ])('refuses the event name "%s"', (name, problem) => {
    expect(catalogProblems(withEvent(name))).toEqual([`event "${name}" ${problem}`]);
  });

  it('checks the names of the generic events too', () => {
    const broken: Catalog = {
      ...catalog,
      commonEvents: { ...catalog.commonEvents, 'Element Click': { description: '' } },
    } as Catalog;
    expect(catalogProblems(broken)).toEqual([
      'event "Element Click" does not end in a verb in the past tense (and a particle)',
    ]);
  });

  it('accepts a snake_case property name and digits in an element id', () => {
    expect(catalogProblems(withEvent('Catalog Sorted', { sort_order: flag }))).toEqual([]);
    expect(catalogProblems(withElement('login.step-2', 'auth', { sort_order: flag }))).toEqual([]);
  });

  it.each(['sortOrder', 'sort-order', 'Sort', '$sort', 'sort_', 'sort1'])(
    'refuses the property name "%s"',
    (name) => {
      expect(catalogProblems(withEvent('Catalog Sorted', { [name]: flag }))).toEqual([
        `event "Catalog Sorted": property "${name}" is not snake_case`,
      ]);
      expect(catalogProblems(withElement('login.other', 'auth', { [name]: flag }))).toEqual([
        `element "login.other": property "${name}" is not snake_case`,
      ]);
    },
  );

  it.each(['login', 'login.google.big', 'Login.google', 'login.google_big', 'login.-google'])(
    'refuses the element id "%s"',
    (id) => {
      expect(catalogProblems(withElement(id, 'auth'))).toContain(
        `element "${id}" is not area.element in kebab-case`,
      );
    },
  );

  it('refuses an element whose prefix is not an area of its zone', () => {
    expect(catalogProblems(withElement('ui-kit.other', 'auth'))).toEqual([
      'element "ui-kit.other": "ui-kit" is not an area of zone "auth"',
    ]);
  });

  it('refuses an area in two zones', () => {
    const broken: Catalog = {
      ...catalog,
      zones: {
        ...catalog.zones,
        auth: { ...catalog.zones.auth, areas: ['login', 'profile-menu', 'cookie'] },
      },
    };
    expect(catalogProblems(broken)).toEqual([
      'area "cookie" belongs to zones "service" and "auth"',
    ]);
  });

  it.each(['cookie banner', 'Cookie', 'cookie`', 'cookie_banner', 'cookie.banner', ''])(
    'refuses the area "%s", even unused',
    (area) => {
      const broken: Catalog = {
        ...catalog,
        zones: {
          ...catalog.zones,
          service: { ...catalog.zones.service, areas: [...catalog.zones.service.areas, area] },
        },
      };
      expect(catalogProblems(broken)).toEqual([`area "${area}" is not kebab-case`]);
    },
  );

  it.each(['Service', 'service`', 'service_page', 'service.page', ''])(
    'refuses the zone key "%s"',
    (key) => {
      const broken: Catalog = {
        ...catalog,
        zones: { ...catalog.zones, [key]: { title: 'Зона', areas: [], description: '' } },
      };
      expect(catalogProblems(broken)).toEqual([
        `zone "${key}" is not kebab-case`,
        `zone "${key}" has no events or elements`,
      ]);
    },
  );

  it('accepts 5 properties of its own and refuses 6', () => {
    const five = { a: flag, b: flag, c: flag, d: flag, e: flag };
    const six = { ...five, f: flag };
    expect(catalogProblems(withEvent('Catalog Sorted', five))).toEqual([]);
    expect(catalogProblems(withElement('login.other', 'auth', five))).toEqual([]);
    expect(catalogProblems(withEvent('Catalog Sorted', six))).toEqual([
      'event "Catalog Sorted": 6 properties, at most 5',
    ]);
    expect(catalogProblems(withElement('login.other', 'auth', six))).toEqual([
      'element "login.other": 6 properties, at most 5',
    ]);
  });

  it('accepts 50 enum values and refuses 51', () => {
    const values = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
    expect(catalogProblems(withEvent('Catalog Sorted', { sort: enumOf(values(50)) }))).toEqual([]);
    expect(catalogProblems(withEvent('Catalog Sorted', { sort: enumOf(values(51)) }))).toEqual([
      'event "Catalog Sorted".sort: 51 values, at most 50',
    ]);
  });

  it('refuses duplicate enum values', () => {
    expect(
      catalogProblems(withElement('login.other', 'auth', { sort: enumOf(['new', 'new']) })),
    ).toEqual(['element "login.other".sort: duplicate values']);
  });

  it.each(['price_asc', 'price-asc', 'top10', '0'])('accepts the enum value "%s"', (value) => {
    expect(catalogProblems(withEvent('Catalog Sorted', { sort: enumOf([value]) }))).toEqual([]);
  });

  it.each(['', 'Price', 'price asc', 'price|asc', 'price`asc', '_asc', 'price__asc', 'price-'])(
    'refuses the enum value "%s"',
    (value) => {
      expect(catalogProblems(withEvent('Catalog Sorted', { sort: enumOf([value]) }))).toEqual([
        `event "Catalog Sorted".sort: value "${value}" is off the pattern`,
      ]);
    },
  );

  it('refuses a zone with no events or elements', () => {
    const broken: Catalog = {
      ...catalog,
      zones: {
        ...catalog.zones,
        // A key no spec plans, so a real zone never replaces it.
        'empty-zone': { title: 'Пустая', areas: ['empty-area'], description: '' },
      },
    };
    expect(catalogProblems(broken)).toEqual(['zone "empty-zone" has no events or elements']);
  });

  it('refuses estimates over 80 % of the monthly limit', () => {
    // Only the SDK's estimate counts, so the sums stay whole numbers.
    const sdkOnly: Catalog = {
      ...catalog,
      sdkPerVisit: 8,
      events: Object.fromEntries(
        Object.entries(catalog.events).map(([name, event]) => [name, { ...event, perVisit: 0 }]),
      ),
      elements: Object.fromEntries(
        Object.entries(catalog.elements).map(([id, element]) => [
          id,
          { ...element, clicksPerVisit: 0, hoversPerVisit: 0 },
        ]),
      ),
    };
    const atLimit = (MONTHLY_LIMIT * BUDGET_THRESHOLD) / 8;
    expect(catalogProblems({ ...sdkOnly, visitsPerMonth: atLimit })).toEqual([]);
    expect(catalogProblems({ ...sdkOnly, visitsPerMonth: atLimit + 1 })).toEqual([
      '800008 events a month, at most 800000',
    ]);
  });

  it('refuses a negative estimate, which would lower the sum', () => {
    const broken: Catalog = {
      ...catalog,
      sdkPerVisit: -1,
      events: {
        ...catalog.events,
        'Login Opened': { ...catalog.events['Login Opened'], perVisit: -0.5 },
      },
      elements: {
        ...catalog.elements,
        'login.google': { ...catalog.elements['login.google'], hoversPerVisit: Number.NaN },
      },
    };
    expect(catalogProblems(broken)).toEqual([
      'sdkPerVisit is -1, not 0 or more',
      'event "Login Opened" perVisit is -0.5, not 0 or more',
      'element "login.google" hoversPerVisit is NaN, not 0 or more',
    ]);
    expect(catalogProblems({ ...catalog, visitsPerMonth: -3000 })).toEqual([
      'visitsPerMonth is -3000, not 0 or more',
    ]);
  });
});

describe('analytics catalog', () => {
  it('lists exactly the known events', () => {
    expect(Object.keys(catalog.events).sort()).toEqual([
      'Account Data Saved',
      'Account Deleted',
      'Catalog Batch Loaded',
      'Catalog Filter Applied',
      'Catalog Searched',
      'Catalog Sorted',
      'Fitting Completed',
      'Fitting Failed',
      'Fitting Refused',
      'Fitting Started',
      'Login Opened',
      'Photo Refused',
      'Photo Uploaded',
      'Signed In',
      'Signed Out',
      'Stores Searched',
    ]);
    expect(Object.keys(catalog.commonEvents).sort()).toEqual([
      'Element Clicked',
      'Element Hovered',
    ]);
  });

  it('gives each event its zone and type', () => {
    const summary = Object.fromEntries(
      Object.entries(catalog.events).map(([name, { zone, type }]) => [name, [zone, type]]),
    );
    expect(summary).toEqual({
      'Login Opened': ['auth', 'interaction'],
      'Signed In': ['auth', 'conversion'],
      'Signed Out': ['auth', 'interaction'],
      'Account Data Saved': ['account', 'interaction'],
      'Account Deleted': ['account', 'interaction'],
      'Catalog Filter Applied': ['catalog', 'interaction'],
      'Catalog Sorted': ['catalog', 'interaction'],
      'Catalog Searched': ['catalog', 'interaction'],
      'Catalog Batch Loaded': ['catalog', 'interaction'],
      'Photo Uploaded': ['fitting', 'interaction'],
      'Photo Refused': ['fitting', 'interaction'],
      'Fitting Started': ['fitting', 'interaction'],
      'Fitting Completed': ['fitting', 'conversion'],
      'Fitting Failed': ['fitting', 'interaction'],
      'Fitting Refused': ['fitting', 'interaction'],
      'Stores Searched': ['stores', 'interaction'],
    });
  });

  it('lists exactly the known elements with their zone and type', () => {
    const summary = Object.fromEntries(
      Object.entries(catalog.elements).map(([name, { zone, type }]) => [name, [zone, type]]),
    );
    expect(summary).toEqual({
      'ui-kit.button-primary': ['service', 'service'],
      'login.google': ['auth', 'interaction'],
      'profile-menu.sign-out': ['auth', 'interaction'],
      'profile-menu.sign-out-everywhere': ['auth', 'interaction'],
      'profile-menu.section': ['auth', 'navigation'],
      'account-menu.section': ['account', 'navigation'],
      'account-menu.back': ['account', 'navigation'],
      'account-invite.sign-in': ['account', 'interaction'],
      'account-delete.open': ['account', 'interaction'],
      'account-delete.cancel': ['account', 'interaction'],
      'catalog.card': ['catalog', 'navigation'],
      'catalog.category': ['catalog', 'navigation'],
      'catalog.filter-brand': ['catalog', 'interaction'],
      'catalog.filter-size': ['catalog', 'interaction'],
      'catalog.filter-color': ['catalog', 'interaction'],
      'catalog.filter-attribute': ['catalog', 'interaction'],
      'catalog.filter-price': ['catalog', 'interaction'],
      'catalog.filter-discount': ['catalog', 'interaction'],
      'catalog.sort': ['catalog', 'interaction'],
      'catalog.sheet-open': ['catalog', 'interaction'],
      'catalog.category-toggle': ['catalog', 'interaction'],
      'catalog.back': ['catalog', 'navigation'],
      'catalog.to-look': ['catalog', 'interaction'],
      'buy-box.add-to-cart': ['product', 'interaction'],
      'buy-box.favourite': ['product', 'interaction'],
      'buy-box.try-on': ['product', 'interaction'],
      'buy-box.tried-on': ['product', 'navigation'],
      'buy-box.to-look': ['product', 'interaction'],
      'related.card': ['product', 'navigation'],
      'related.add-to-cart': ['product', 'interaction'],
      'related.scroll': ['product', 'interaction'],
      'related.to-look': ['product', 'interaction'],
      'photos.upload': ['fitting', 'interaction'],
      'photos.camera': ['fitting', 'interaction'],
      'photos.set-default': ['fitting', 'interaction'],
      'photos.delete': ['fitting', 'interaction'],
      'try-on.start': ['fitting', 'interaction'],
      'try-on.photo': ['fitting', 'interaction'],
      'try-on.retry': ['fitting', 'interaction'],
      'try-on.close': ['fitting', 'interaction'],
      'try-on.other-photo': ['fitting', 'interaction'],
      'result.try-colour': ['fitting', 'interaction'],
      'result.reason': ['fitting', 'interaction'],
      'result.regenerate': ['fitting', 'interaction'],
      'result.regenerate-open': ['fitting', 'interaction'],
      'result.download': ['fitting', 'interaction'],
      'result.fullscreen': ['fitting', 'interaction'],
      'result.add-to-cart': ['fitting', 'interaction'],
      'result.add-to-cart-all': ['fitting', 'interaction'],
      'result.item-colour': ['fitting', 'interaction'],
      'result.to-look': ['fitting', 'interaction'],
      'result.other-photo': ['fitting', 'interaction'],
      'fitting-toast.open': ['fitting', 'navigation'],
      'fitting-toast.retry': ['fitting', 'interaction'],
      'history.tab': ['fitting', 'interaction'],
      'history.open': ['fitting', 'navigation'],
      'history.menu': ['fitting', 'interaction'],
      'history.download': ['fitting', 'interaction'],
      'history.delete': ['fitting', 'interaction'],
      'history.choose-item': ['fitting', 'navigation'],
      'history.repeat': ['fitting', 'interaction'],
      'history.compare': ['fitting', 'interaction'],
      'history.compare-open': ['fitting', 'navigation'],
      'compare.open': ['fitting', 'navigation'],
      'compare.add-to-cart': ['fitting', 'interaction'],
      'room.open': ['fitting', 'interaction'],
      'room.fill': ['fitting', 'navigation'],
      'room.remove': ['fitting', 'interaction'],
      'room.undo': ['fitting', 'interaction'],
      'room.clear': ['fitting', 'interaction'],
      'room.add-to-cart-all': ['fitting', 'interaction'],
      'room.try-on': ['fitting', 'interaction'],
      'header.burger': ['header', 'interaction'],
      'header.search': ['header', 'interaction'],
      'burger.category': ['header', 'navigation'],
      'footer.link': ['footer', 'navigation'],
      'stores.card': ['stores', 'interaction'],
      'stores.details': ['stores', 'interaction'],
      'stores.phone': ['stores', 'navigation'],
      'stores.route': ['stores', 'navigation'],
      'stores.pin': ['stores', 'interaction'],
      'stores.tab': ['stores', 'interaction'],
    });
  });

  it('uses only declared zones', () => {
    const zones = Object.keys(catalog.zones);
    for (const entry of [...Object.values(catalog.events), ...Object.values(catalog.elements)]) {
      expect(zones).toContain(entry.zone);
    }
  });
});
