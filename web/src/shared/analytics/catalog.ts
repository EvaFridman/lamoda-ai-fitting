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
  // 5 page views and 7 heatmap clicks a visit (`autocapture` is off; the catalog's categories are
  // paths of their own, spec 0014 O102); «Мои фото» adds about one more (spec 0019 plan §9).
  visitsPerMonth: 3_000,
  sdkPerVisit: 13,
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
    catalog: {
      title: 'Каталог',
      areas: ['catalog'],
      description:
        'Страницы `/catalog` и `/catalog/<slug>`: список категорий слева, ряд фильтров над сеткой (на узком экране — шторка «Фильтры»), сетка карточек.',
    },
    fitting: {
      title: 'Примерка',
      areas: ['photos'],
      description:
        'Онлайн-примерка (спека 0019). `photos` — фото для примерки: загрузка (подсказки и согласия первой загрузки, экран отказа) и страница «Мои фото» (`/customer/photos`).',
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
    'Account Deleted': {
      zone: 'account',
      type: 'interaction',
      description:
        'Аккаунт удалён: после ответа api, до того как SDK забудет пользователя, поэтому приходит с его id. `Signed Out` вместе с ним не отправляется.',
      perVisit: 0.001,
      properties: {},
    },
    'Catalog Filter Applied': {
      zone: 'catalog',
      type: 'interaction',
      description:
        'Посетитель изменил фильтр: в ряду сразу, в шторке по «Показать N товаров» — по событию на каждый изменённый фильтр. `values` — сколько значений выбрано (у цены — сколько границ задано, у скидки — 1 или 0), 0 — фильтр снят. Сами значения не отправляются.',
      perVisit: 0.8,
      properties: {
        filter: {
          kind: 'enum',
          values: ['brand', 'size', 'color', 'attribute', 'price', 'discount'],
        },
        values: { kind: 'number' },
      },
    },
    'Catalog Sorted': {
      zone: 'catalog',
      type: 'interaction',
      description: 'Посетитель сменил порядок: в ряду сразу, в шторке по «Показать N товаров».',
      perVisit: 0.2,
      properties: {
        // `PRODUCT_SORTS` of `entities/product`, copied: the catalog imports nothing.
        sort: { kind: 'enum', values: ['new', 'price_asc', 'price_desc', 'discount', 'rating'] },
      },
    },
    'Catalog Searched': {
      zone: 'catalog',
      type: 'interaction',
      description:
        'Посетитель искал: пришла первая порция товаров для запроса, отправленного в шапке (тот же запрос ещё раз — тоже поиск), или для страницы, которую открыла ссылка. Переход в категорию с тем же запросом, «Назад», «Вперёд», перезагрузка и смена фильтра — не поиск. `query_length` — длина запроса в символах, `results` — сколько всего найдено. Текст запроса не отправляется: ни в свойствах, ни в адресе страницы (`q` убирается из `$current_url` и других адресов всех событий, спека 0014, O104). Страница, открытая с `cursor`, его не отправляет: итога там нет.',
      perVisit: 0.3,
      properties: {
        query_length: { kind: 'number' },
        results: { kind: 'number' },
      },
    },
    'Catalog Batch Loaded': {
      zone: 'catalog',
      type: 'interaction',
      description:
        'Догружена следующая порция сетки, когда посетитель долистал до конца. `batch` — её номер в показанном списке (2, 3, …). Первая порция не отправляется (это просмотр страницы), как и порции, которые сетка грузит сама, чтобы вернуться на место после «Назад».',
      perVisit: 2,
      properties: {
        batch: { kind: 'number' },
      },
    },
    'Photo Uploaded': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Фото для примерки загружено и прошло проверку: после ответа api. `saved` — сохранено в «Мои фото» (не одноразовое), `source` — выбрано из файлов или снято камерой, `place` — где загружено, `first` — первая загрузка в этом браузере (с подсказками и согласиями). Само фото и ссылка на него не отправляются.',
      perVisit: 0.01,
      properties: {
        saved: { kind: 'boolean' },
        source: { kind: 'enum', values: ['file', 'camera'] },
        place: { kind: 'enum', values: ['photos'] },
        first: { kind: 'boolean' },
      },
    },
    'Photo Refused': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Проверка не пропустила фото: после ответа api. `reason` — причина: `dark` слишком темно, `not_full` не в полный рост, `many_people` больше одного человека, `child` похоже на ребёнка, `no_person` нет человека, `moderation` не прошло модерацию, `other` причина не распознана. `source`, `place`, `first` — как у `Photo Uploaded`.',
      perVisit: 0.005,
      properties: {
        reason: {
          kind: 'enum',
          values: ['dark', 'not_full', 'many_people', 'child', 'no_person', 'moderation', 'other'],
        },
        source: { kind: 'enum', values: ['file', 'camera'] },
        place: { kind: 'enum', values: ['photos'] },
        first: { kind: 'boolean' },
      },
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
        'Раздел личного кабинета в меню профиля: «Мои заказы», «Магазины», «Мои данные», «Мои примерки» или «Мои фото».',
      clicksPerVisit: 0.04,
      hoversPerVisit: 0.06,
      properties: {
        section: { kind: 'enum', values: ['orders', 'stores', 'data', 'fittings', 'photos'] },
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
        section: { kind: 'enum', values: ['orders', 'stores', 'data', 'fittings', 'photos'] },
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
    'account-delete.open': {
      zone: 'account',
      type: 'interaction',
      description: '«Удалить аккаунт» на странице «Мои данные»: открывает подтверждение.',
      clicksPerVisit: 0.003,
      hoversPerVisit: 0.005,
    },
    'account-delete.cancel': {
      zone: 'account',
      type: 'interaction',
      description:
        '«Отмена» в подтверждении удаления. Закрытие по Esc, крестику или фону не отправляется: это открытия минус удаления и отмены.',
      clicksPerVisit: 0.002,
      hoversPerVisit: 0.002,
    },
    'catalog.card': {
      zone: 'catalog',
      type: 'navigation',
      description:
        'Карточка товара в сетке. `position` — её место в показанном списке, с 1; id товара не отправляется.',
      clicksPerVisit: 0.5,
      hoversPerVisit: 8,
      properties: {
        position: { kind: 'number' },
      },
    },
    'catalog.category': {
      zone: 'catalog',
      type: 'navigation',
      description:
        'Категория в списке слева: ссылка на `/catalog/<slug>`. Одна на все строки: наведение уходит раз за просмотр страницы. Категории в шапке не отслеживаются.',
      clicksPerVisit: 0.4,
      hoversPerVisit: 1,
    },
    'catalog.filter-brand': {
      zone: 'catalog',
      type: 'interaction',
      description: 'Чип «Бренд» в ряду фильтров: открывает список.',
      clicksPerVisit: 0.25,
      hoversPerVisit: 0.3,
    },
    'catalog.filter-size': {
      zone: 'catalog',
      type: 'interaction',
      description: 'Чип «Размер» в ряду фильтров.',
      clicksPerVisit: 0.2,
      hoversPerVisit: 0.25,
    },
    'catalog.filter-color': {
      zone: 'catalog',
      type: 'interaction',
      description: 'Чип атрибута-цвета в ряду фильтров; один на все такие чипы.',
      clicksPerVisit: 0.2,
      hoversPerVisit: 0.25,
    },
    'catalog.filter-attribute': {
      zone: 'catalog',
      type: 'interaction',
      description:
        'Чип любого другого атрибута (материал, сезон…) в ряду фильтров; один на все такие чипы, название атрибута не отправляется.',
      clicksPerVisit: 0.1,
      hoversPerVisit: 0.2,
    },
    'catalog.filter-price': {
      zone: 'catalog',
      type: 'interaction',
      description: 'Чип «Цена» в ряду фильтров.',
      clicksPerVisit: 0.15,
      hoversPerVisit: 0.2,
    },
    'catalog.filter-discount': {
      zone: 'catalog',
      type: 'interaction',
      description:
        'Чип «Только со скидкой» в ряду фильтров: клик сразу включает или снимает фильтр.',
      clicksPerVisit: 0.1,
      hoversPerVisit: 0.15,
    },
    'catalog.sort': {
      zone: 'catalog',
      type: 'interaction',
      description: 'Чип сортировки в ряду фильтров.',
      clicksPerVisit: 0.2,
      hoversPerVisit: 0.25,
    },
    'photos.upload': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Добавить фото» или «Выбрать фото»: открывает выбор файла, а при первой загрузке — подсказки и согласия.',
      clicksPerVisit: 0.02,
      hoversPerVisit: 0.02,
    },
    'photos.camera': {
      zone: 'fitting',
      type: 'interaction',
      description: '«Сделать фото»: на телефоне открывает камеру, на компьютере — выбор файла.',
      clicksPerVisit: 0.005,
      hoversPerVisit: 0.003,
    },
    'photos.set-default': {
      zone: 'fitting',
      type: 'interaction',
      description: '«Сделать основным» у фото на странице «Мои фото».',
      clicksPerVisit: 0.003,
      hoversPerVisit: 0.003,
    },
    'photos.delete': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Удалить» в подтверждении удаления фото. Кнопка с корзиной, которая открывает подтверждение, не отслеживается.',
      clicksPerVisit: 0.002,
      hoversPerVisit: 0.002,
    },
  },
});
