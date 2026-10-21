// Every analytics event, its properties and every tracked element (spec 0015 R3): the types
// `track` and `useTrackedElement` accept are derived from it (`events.ts`), so sending anything
// else fails `npm run typecheck`. Plain data with no imports: tests and the events document read
// it as it is. Page views are Mixpanel's own `$mp_web_page_view`, sent by the SDK.

/** What an entry serves (R4): `conversion` only for an event of a reached goal. */
export type EntryType = 'navigation' | 'interaction' | 'conversion' | 'service';

/** A property is a closed list, a number or a boolean: never free text (R7, AC6). */
export type Property =
  { kind: 'enum'; values: readonly string[] } | { kind: 'number' } | { kind: 'boolean' };

export type Properties = Readonly<Record<string, Property>>;

export type Catalog = {
  /** Expected visits a month, the owner's estimate for the budget (R15). */
  visitsPerMonth: number;
  /** Events the SDK sends by itself per visit: page views, heatmap clicks (R15). */
  sdkPerVisit: number;
  zones: Readonly<Record<string, { title: string; areas: readonly string[]; description: string }>>;
  /** The generic click and hover events: each send carries its element's zone (R14). */
  commonEvents: Readonly<Record<'Element Clicked' | 'Element Hovered', { description: string }>>;
  events: Readonly<
    Record<
      string,
      {
        zone: string;
        type: EntryType;
        description: string;
        /** Average sends per visit. */
        perVisit: number;
        properties: Properties;
      }
    >
  >;
  elements: Readonly<
    Record<
      string,
      {
        zone: string;
        type: EntryType;
        description: string;
        clicksPerVisit: number;
        hoversPerVisit: number;
        properties?: Properties;
      }
    >
  >;
};

// The zone of every event and element must be a key of `zones`. A wrong one is checked against an
// object that names the zones, so the error points at its `zone` (two different literals would
// make the whole entry `never`).
type ZoneChecked<C extends Catalog, Z> = {
  zone: Z extends keyof C['zones'] ? unknown : { mustBeOneOf: keyof C['zones'] };
};
// Property names a send already carries (R5) or Mixpanel reserves: an entry's own one would
// replace it. Names with `$` fail the name pattern (plan §5, a test of T4); `mp_` passes it.
type ReservedProperties = { [K in 'time' | 'token' | 'distinct_id' | `mp_${string}`]?: never };
type ReservedElementProperties = ReservedProperties & {
  [K in 'element' | 'zone' | 'type']?: never;
};

type Checked<C extends Catalog> = {
  // The generic events are `commonEvents` only (R14).
  events: { [K in 'Element Clicked' | 'Element Hovered']?: never } & {
    [E in keyof C['events']]: ZoneChecked<C, C['events'][E]['zone']> & {
      properties: ReservedProperties;
    };
  };
  elements: {
    [E in keyof C['elements']]: ZoneChecked<C, C['elements'][E]['zone']> & {
      properties?: ReservedElementProperties;
    };
  };
};

/** Checks a catalog and keeps its literal types. */
export function defineCatalog<const C extends Catalog>(catalog: C & Checked<C>): C {
  return catalog;
}

export const catalog = defineCatalog({
  // The owner's estimates (R15, R17), set without traffic data: a demo site. The SDK sends about
  // 4 page views and 6 heatmap clicks a visit (`autocapture` is off).
  visitsPerMonth: 3_000,
  sdkPerVisit: 10,
  zones: {
    service: {
      title: 'Служебное',
      areas: ['ui-kit', 'cookie'],
      description:
        'То, что обслуживает сайт, а не цель посетителя: страница `/ui-kit` и согласие на cookie (баннер внизу страницы).',
    },
    auth: {
      title: 'Вход и профиль',
      areas: ['login', 'profile-menu'],
      description:
        'Вход через Google и выход. `login` — окно входа, `profile-menu` — меню профиля в шапке.',
    },
    account: {
      title: 'Личный кабинет',
      areas: ['account-menu', 'account-data', 'account-delete', 'account-invite'],
      description:
        'Страницы `/customer`. `account-menu` — меню разделов (на узком экране — список разделов и путь назад к нему), `account-data` — «Мои данные», `account-delete` — удаление аккаунта, `account-invite` — приглашение войти вместо раздела.',
    },
  },
  commonEvents: {
    'Element Clicked': {
      description:
        'Клик по отслеживаемому элементу. Несёт `element`, его `zone`, `type` и свойства элемента.',
    },
    'Element Hovered': {
      description:
        'Наведение мыши на отслеживаемый элемент на 500 мс: один раз за просмотр страницы на элемент и набор его свойств.',
    },
  },
  events: {
    'Login Opened': {
      zone: 'auth',
      type: 'interaction',
      description:
        'Посетитель открыл окно входа. Не отправляется, когда окно открывается само после неудачного входа.',
      perVisit: 0.1,
      properties: {},
    },
    'Signed In': {
      zone: 'auth',
      type: 'conversion',
      description:
        'Вход выполнен: один раз, на странице, куда вернулся вход, начатый в этой вкладке.',
      perVisit: 0.05,
      properties: {},
    },
    'Signed Out': {
      zone: 'auth',
      type: 'interaction',
      description: 'Выход выполнен: после «Выйти» или «Выйти со всех устройств».',
      perVisit: 0.02,
      properties: {},
    },
    'Account Data Saved': {
      zone: 'account',
      type: 'interaction',
      description:
        '«Мои данные» сохранены: после ответа api, не по клику. Какие поля и значения изменились, не отправляется.',
      perVisit: 0.01,
      properties: {},
    },
  },
  elements: {
    'ui-kit.button-primary': {
      zone: 'service',
      type: 'service',
      description: 'Первая основная кнопка на `/ui-kit`: проверка отправки кликов и наведений.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.01,
    },
    'login.google': {
      zone: 'auth',
      type: 'interaction',
      description: 'Кнопка «Войти через Google» в окне входа.',
      clicksPerVisit: 0.06,
      hoversPerVisit: 0.08,
    },
    'profile-menu.sign-out': {
      zone: 'auth',
      type: 'interaction',
      description: '«Выйти» в меню профиля.',
      clicksPerVisit: 0.02,
      hoversPerVisit: 0.03,
    },
    'profile-menu.sign-out-everywhere': {
      zone: 'auth',
      type: 'interaction',
      description: '«Выйти со всех устройств» в меню профиля.',
      clicksPerVisit: 0.005,
      hoversPerVisit: 0.01,
    },
    'profile-menu.section': {
      zone: 'auth',
      type: 'navigation',
      description:
        'Раздел личного кабинета в меню профиля: «Мои заказы», «Магазины», «Мои данные» или «Мои примерки».',
      clicksPerVisit: 0.04,
      hoversPerVisit: 0.06,
      properties: {
        section: { kind: 'enum', values: ['orders', 'stores', 'data', 'fittings'] },
      },
    },
    'account-menu.section': {
      zone: 'account',
      type: 'navigation',
      description:
        'Раздел в меню личного кабинета (на узком экране — в списке разделов на `/customer`).',
      clicksPerVisit: 0.05,
      hoversPerVisit: 0.06,
      properties: {
        section: { kind: 'enum', values: ['orders', 'stores', 'data', 'fittings'] },
      },
    },
    'account-menu.back': {
      zone: 'account',
      type: 'navigation',
      description: '«Личный кабинет» над разделом на узком экране: назад к списку разделов.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.005,
    },
    'account-invite.sign-in': {
      zone: 'account',
      type: 'interaction',
      description:
        'Кнопка «Войти» в приглашении, которое видит вышедший посетитель вместо раздела кабинета.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.01,
    },
  },
});
