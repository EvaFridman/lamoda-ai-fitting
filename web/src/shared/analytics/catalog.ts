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

// Where a catalog filter was opened: its chip in the desktop row or its row in the phone sheet
// (spec 0020 W15). Sends from before the sheet carry no `surface` and were all chips.
const surface = { kind: 'enum', values: ['chips', 'sheet'] } as const;
const surfaceNote =
  '`surface` — `chips` или `sheet`. До спеки 0020 свойства не было и все отправки были чипами, так что отчёт по чипам фильтрует `surface != sheet`, а не `surface == chips`.';

/** Checks a catalog and keeps its literal types. */
export function defineCatalog<const C extends Catalog>(catalog: C & Checked<C>): C {
  return catalog;
}

export const catalog = defineCatalog({
  // The owner's estimates (R15, R17), set without traffic data: a demo site. The SDK sends about
  // 5 page views and 7 heatmap clicks a visit (`autocapture` is off; the catalog's categories are
  // paths of their own, spec 0014 O102); «Мои фото» adds about one more, «Мои примерки» another,
  // the product page another (spec 0019 plan §9, A78, A84).
  visitsPerMonth: 3_000,
  sdkPerVisit: 15,
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
    product: {
      title: 'Страница товара',
      areas: ['buy-box', 'related'],
      description:
        'Страница `/products/<id>` (спека 0019). `buy-box` — блок покупки справа от галереи (на телефоне под ней): «Добавить в корзину», «В избранное», «Примерить», «Вы это примеряли». `related` — «С этим товаром выбирают» под ним: один ряд компактных карточек, их «В корзину» и стрелки ряда. Галерея, «О товаре» и хлебные крошки не отслеживаются; окно примерки, открытое отсюда, шлёт элементы и события зоны `fitting`.',
    },
    fitting: {
      title: 'Примерка',
      areas: ['photos', 'try-on', 'result', 'fitting-toast', 'history'],
      description:
        'Онлайн-примерка (спека 0019). `photos` — фото для примерки: загрузка (подсказки и согласия первой загрузки, экран отказа) и страница «Мои фото» (`/customer/photos`). `try-on` — окно примерки до результата: выбор фото, ожидание, экраны лимита и ошибок. `result` — результат примерки и шторка «Что поменять?». `fitting-toast` — уведомления «Примерка готова» и «Примерка … не удалась» на любой странице сайта. `history` — «Мои примерки» (`/customer/fittings`): вкладки, карточки, меню и шторка действий карточки, подтверждение удаления, пустой список.',
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
        'Фото для примерки загружено и прошло проверку: после ответа api. `saved` — сохранено в «Мои фото» (не одноразовое), `source` — выбрано из файлов или снято камерой, `place` — где загружено: `photos` — страница «Мои фото», `try-on` — выбор фото в окне примерки, `first` — первая загрузка в этом браузере (с подсказками и согласиями). Само фото и ссылка на него не отправляются.',
      perVisit: 0.01,
      properties: {
        saved: { kind: 'boolean' },
        source: { kind: 'enum', values: ['file', 'camera'] },
        place: { kind: 'enum', values: ['photos', 'try-on'] },
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
        place: { kind: 'enum', values: ['photos', 'try-on'] },
        first: { kind: 'boolean' },
      },
    },
    'Fitting Started': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Примерка запущена: после ответа api (новая, идущая или уже готовая с тем же фото, вещами и цветами). `kind` — одна вещь или образ, `source` — каким действием: `picker` — «Примерить» на выборе фото, `retry` — «Попробовать ещё раз» на экране ошибки или «Повторить» в уведомлении, `colour` — другой цвет на результате, `regenerate` — «Перегенерировать». `items` — сколько вещей, `repeated` — api открыл готовый результат без списания, `with_prompt` — есть пожелания или комментарий перегенерации (сам текст не отправляется).',
      perVisit: 0.03,
      properties: {
        kind: { kind: 'enum', values: ['single', 'look'] },
        source: { kind: 'enum', values: ['picker', 'retry', 'colour', 'regenerate'] },
        items: { kind: 'number' },
        repeated: { kind: 'boolean' },
        with_prompt: { kind: 'boolean' },
      },
    },
    'Fitting Completed': {
      zone: 'fitting',
      type: 'conversion',
      description:
        'Результат примерки готов: вкладка, которая её запустила или видела идущей, узнала статус `completed`; один раз на генерацию. `model` — модель (неизвестная — `other`), `duration` — секунды от создания до результата (у готового результата, открытого повтором, 0), `counts_against_limit` — списана ли примерка месяца, `repeated` — открыт готовый результат.',
      perVisit: 0.025,
      properties: {
        kind: { kind: 'enum', values: ['single', 'look'] },
        model: { kind: 'enum', values: ['gpt-image-2', 'gpt-image-2-5-sunburst', 'other'] },
        duration: { kind: 'number' },
        counts_against_limit: { kind: 'boolean' },
        repeated: { kind: 'boolean' },
      },
    },
    'Fitting Failed': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Примерка не удалась: вкладка, которая её запустила или видела идущей, узнала статус `failed`; один раз на генерацию. `reason` — код api, `model` и `duration` — как у `Fitting Completed`. Примерка месяца возвращается.',
      perVisit: 0.004,
      properties: {
        kind: { kind: 'enum', values: ['single', 'look'] },
        reason: {
          kind: 'enum',
          values: [
            'photo_dark',
            'photo_not_full',
            'photo_many_people',
            'photo_child',
            'photo_no_person',
            'prompt_refused',
            'model_timeout',
            'moderation',
            'provider_error',
          ],
        },
        model: { kind: 'enum', values: ['gpt-image-2', 'gpt-image-2-5-sunburst', 'other'] },
        duration: { kind: 'number' },
      },
    },
    'Fitting Refused': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Api не запустил примерку или перегенерацию: `limit_reached` — примерки месяца закончились, `prompt_refused` — пожелания или комментарий не прошли проверку. Генерации не было, примерка не списана.',
      perVisit: 0.003,
      properties: {
        kind: { kind: 'enum', values: ['single', 'look'] },
        reason: { kind: 'enum', values: ['limit_reached', 'prompt_refused'] },
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
        'Категория в списке слева или в списке под строкой категории на экране уже 600 px: ссылка на `/catalog/<slug>`. Одна на все строки обоих списков: наведение уходит раз за просмотр страницы. Категории в шапке не отслеживаются.',
      clicksPerVisit: 0.5,
      hoversPerVisit: 1,
    },
    'catalog.filter-brand': {
      zone: 'catalog',
      type: 'interaction',
      description: `«Бренд»: чип в ряду фильтров (открывает список) или строка в шторке «Фильтры» (открывает экран). ${surfaceNote}`,
      clicksPerVisit: 0.35,
      hoversPerVisit: 0.305,
      properties: { surface },
    },
    'catalog.filter-size': {
      zone: 'catalog',
      type: 'interaction',
      description: `«Размер»: чип в ряду фильтров или строка в шторке «Фильтры». ${surfaceNote}`,
      clicksPerVisit: 0.3,
      hoversPerVisit: 0.255,
      properties: { surface },
    },
    'catalog.filter-color': {
      zone: 'catalog',
      type: 'interaction',
      description: `Атрибут-цвет: чип в ряду фильтров или строка в шторке «Фильтры»; один на все такие чипы и строки. ${surfaceNote}`,
      clicksPerVisit: 0.3,
      hoversPerVisit: 0.255,
      properties: { surface },
    },
    'catalog.filter-attribute': {
      zone: 'catalog',
      type: 'interaction',
      description: `Любой другой атрибут (материал, сезон…): чип в ряду фильтров или строка в шторке «Фильтры»; один на все такие чипы и строки, название атрибута не отправляется. ${surfaceNote}`,
      clicksPerVisit: 0.15,
      hoversPerVisit: 0.2,
      properties: { surface },
    },
    'catalog.filter-price': {
      zone: 'catalog',
      type: 'interaction',
      description: `«Цена»: чип в ряду фильтров или строка в шторке «Фильтры». ${surfaceNote}`,
      clicksPerVisit: 0.23,
      hoversPerVisit: 0.2,
      properties: { surface },
    },
    'catalog.filter-discount': {
      zone: 'catalog',
      type: 'interaction',
      description: `«Только со скидкой»: чип в ряду фильтров (клик сразу включает или снимает фильтр) или переключатель в шторке «Фильтры» (меняет только черновик шторки). ${surfaceNote}`,
      clicksPerVisit: 0.15,
      hoversPerVisit: 0.15,
      properties: { surface },
    },
    'catalog.sort': {
      zone: 'catalog',
      type: 'interaction',
      description: `Сортировка: чип в ряду фильтров или строка «Сортировка» в шторке «Фильтры». ${surfaceNote}`,
      clicksPerVisit: 0.35,
      hoversPerVisit: 0.255,
      properties: { surface },
    },
    'catalog.sheet-open': {
      zone: 'catalog',
      type: 'interaction',
      description:
        'Кнопка «Фильтры» на узком экране: открывает шторку фильтров. `active` — есть ли на ней точка (в адресе фильтр, сортировка не по умолчанию или поиск).',
      clicksPerVisit: 0.3,
      hoversPerVisit: 0.02,
      properties: { active: { kind: 'boolean' } },
    },
    'catalog.category-toggle': {
      zone: 'catalog',
      type: 'interaction',
      description:
        'Строка с текущей категорией («⌄ Одежда», «Все товары» на `/catalog`) на экране уже 600 px: открывает и закрывает список категорий под ней. `expanded` — состояние, в которое переводит клик (`true` — список открывается).',
      clicksPerVisit: 0.25,
      hoversPerVisit: 0.005,
      properties: { expanded: { kind: 'boolean' } },
    },
    'catalog.back': {
      zone: 'catalog',
      type: 'navigation',
      description:
        'Стрелка «←» перед названием, на экране уже 600 px. `target` — куда она ведёт: `history` — назад по истории (предыдущая страница была этого сайта), `catalog` — на `/catalog`.',
      clicksPerVisit: 0.1,
      hoversPerVisit: 0.005,
      properties: { target: { kind: 'enum', values: ['history', 'catalog'] } },
    },
    'buy-box.add-to-cart': {
      zone: 'product',
      type: 'interaction',
      description:
        '«Добавить в корзину» в блоке покупки: заглушка, показывает уведомление, что в прототипе нет корзины. `tried_on` — показано ли «Вы это примеряли» (у посетителя есть готовая примерка этого товара); у не вошедшего — `false`.',
      clicksPerVisit: 0.03,
      hoversPerVisit: 0.06,
      properties: { tried_on: { kind: 'boolean' } },
    },
    'buy-box.favourite': {
      zone: 'product',
      type: 'interaction',
      description:
        'Сердце «В избранное» в блоке покупки: заглушка, не остаётся нажатым, показывает уведомление. `tried_on` — как у `buy-box.add-to-cart`. Сердца на карточках похожих товаров и каталога не отслеживаются.',
      clicksPerVisit: 0.02,
      hoversPerVisit: 0.03,
      properties: { tried_on: { kind: 'boolean' } },
    },
    'buy-box.try-on': {
      zone: 'product',
      type: 'interaction',
      description:
        '«Примерить» в блоке покупки. `signed_in` — вошёл ли посетитель: `true` открывает окно примерки, `false` — окно входа (тогда приходит и `Login Opened`). Пока загружаются сессия и лимит и когда примерки месяца закончились, кнопка отключена и ничего не шлёт.',
      clicksPerVisit: 0.06,
      hoversPerVisit: 0.1,
      properties: { signed_in: { kind: 'boolean' } },
    },
    'buy-box.tried-on': {
      zone: 'product',
      type: 'navigation',
      description:
        '«Вы это примеряли · Смотреть» в блоке покупки: открывает последний результат этого товара в окне примерки. Id примерки, дата и цвет не отправляются.',
      clicksPerVisit: 0.005,
      hoversPerVisit: 0.008,
    },
    'related.card': {
      zone: 'product',
      type: 'navigation',
      description:
        'Карточка в «С этим товаром выбирают»: ссылка на страницу товара. `position` — её место в блоке, с 1 (не больше 6); id товара не отправляется. Вешалка, сердце и «В корзину» карточки — не ссылка и этот элемент не шлют.',
      clicksPerVisit: 0.08,
      hoversPerVisit: 0.4,
      properties: { position: { kind: 'number' } },
    },
    'related.add-to-cart': {
      zone: 'product',
      type: 'interaction',
      description:
        '«В корзину» под карточкой в «С этим товаром выбирают»: заглушка, показывает уведомление. Один элемент на все карточки: наведение уходит раз за просмотр страницы.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.03,
    },
    'related.scroll': {
      zone: 'product',
      type: 'interaction',
      description:
        'Стрелки «‹» и «›» ряда «С этим товаром выбирают» (от 600 px; на телефоне ряд листается свайпом, он не отслеживается): сдвигают ряд на ширину видимых карточек. `direction` — `prev` («‹») или `next` («›»). Отключённая стрелка на конце ряда ничего не шлёт.',
      clicksPerVisit: 0.02,
      hoversPerVisit: 0.02,
      properties: { direction: { kind: 'enum', values: ['prev', 'next'] } },
    },
    'photos.upload': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Добавить фото» или «Выбрать фото» (на странице «Мои фото»), «Загрузить фото» или «+ Новое» (на выборе фото в окне примерки): открывает выбор файла, а при первой загрузке — подсказки и согласия.',
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
        '«Удалить» в подтверждении удаления фото. Текстовая кнопка «Удалить» у фото, которая открывает подтверждение, не отслеживается.',
      clicksPerVisit: 0.002,
      hoversPerVisit: 0.002,
    },
    'try-on.photo': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Сохранённое фото в ленте на выборе фото: выбирает его для примерки. `is_default` — фото по умолчанию.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.01,
      properties: { is_default: { kind: 'boolean' } },
    },
    'try-on.start': {
      zone: 'fitting',
      type: 'interaction',
      description: '«Примерить» на выборе фото.',
      clicksPerVisit: 0.025,
      hoversPerVisit: 0.02,
    },
    'try-on.retry': {
      zone: 'fitting',
      type: 'interaction',
      description: '«Попробовать ещё раз» на экране ошибки примерки.',
      clicksPerVisit: 0.002,
      hoversPerVisit: 0.002,
    },
    'try-on.close': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Закрытие окна примерки кнопкой: `wait` — «Закрыть и продолжить покупки» (на телефоне «Свернуть») во время ожидания, `error` — «Закрыть» на экране ошибки. Крестик и Esc не отслеживаются.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.005,
      properties: { screen: { kind: 'enum', values: ['wait', 'error'] } },
    },
    'try-on.other-photo': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Другое фото» («Выбрать другое фото» на телефоне) на экране «Не можем показать результат»: назад к выбору фото.',
      clicksPerVisit: 0.001,
      hoversPerVisit: 0.001,
    },
    'result.download': {
      zone: 'fitting',
      type: 'interaction',
      description: 'Плитка «Скачать» под результатом.',
      clicksPerVisit: 0.008,
      hoversPerVisit: 0.01,
    },
    'result.fullscreen': {
      zone: 'fitting',
      type: 'interaction',
      description: 'Плитка «Во весь экран» под результатом.',
      clicksPerVisit: 0.008,
      hoversPerVisit: 0.01,
    },
    'result.try-colour': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Цвет в «Примерить другой цвет». `tried` — этот цвет уже примерен на этом фото: результат откроется сразу и бесплатно. Текущий цвет не нажимается.',
      clicksPerVisit: 0.008,
      hoversPerVisit: 0.01,
      properties: { tried: { kind: 'boolean' } },
    },
    'result.regenerate-open': {
      zone: 'fitting',
      type: 'interaction',
      description: '«Хотите что-то поменять в образе?»: открывает шторку «Что поменять?».',
      clicksPerVisit: 0.006,
      hoversPerVisit: 0.006,
    },
    'result.reason': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Причина в шторке «Что поменять?». `reason` — какая: лицо, фигура, вещь, фон, другое; `checked` — отмечена ли после нажатия.',
      clicksPerVisit: 0.008,
      hoversPerVisit: 0.006,
      properties: {
        reason: { kind: 'enum', values: ['face', 'figure', 'item', 'background', 'other'] },
        checked: { kind: 'boolean' },
      },
    },
    'result.regenerate': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Перегенерировать» в шторке «Что поменять?». `reasons` — сколько причин отмечено, `with_comment` — есть ли комментарий (сам текст не отправляется), `free` — бесплатна ли эта перегенерация.',
      clicksPerVisit: 0.004,
      hoversPerVisit: 0.003,
      properties: {
        reasons: { kind: 'number' },
        with_comment: { kind: 'boolean' },
        free: { kind: 'boolean' },
      },
    },
    'result.add-to-cart': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Добавить в корзину» («В корзину» на телефоне) у вещи результата: заглушка, показывает уведомление, что в прототипе нет корзины.',
      clicksPerVisit: 0.004,
      hoversPerVisit: 0.006,
    },
    'result.other-photo': {
      zone: 'fitting',
      type: 'interaction',
      description: '«Примерить на другом фото»: назад к выбору фото в том же окне.',
      clicksPerVisit: 0.002,
      hoversPerVisit: 0.002,
    },
    'fitting-toast.open': {
      zone: 'fitting',
      type: 'navigation',
      description:
        '«Открыть» в уведомлении «Примерка готова»: открывает результат. `kind` — одна вещь или образ.',
      clicksPerVisit: 0.008,
      hoversPerVisit: 0.003,
      properties: { kind: { kind: 'enum', values: ['single', 'look'] } },
    },
    'fitting-toast.retry': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Повторить» в уведомлении «Примерка … не удалась». `kind` — одна вещь или образ.',
      clicksPerVisit: 0.001,
      hoversPerVisit: 0.001,
      properties: { kind: { kind: 'enum', values: ['single', 'look'] } },
    },
    'history.tab': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Переход на вкладку «Все», «Одна вещь» или «Образы» в «Моих примерках» (клик или стрелки). `tab` — выбранная вкладка. Нажатие на текущую вкладку и вкладка при открытии страницы не отправляются, наведение тоже.',
      clicksPerVisit: 0.02,
      hoversPerVisit: 0,
      properties: { tab: { kind: 'enum', values: ['all', 'single', 'look'] } },
    },
    'history.open': {
      zone: 'fitting',
      type: 'navigation',
      description:
        'Открыть примерку из «Моих примерок». `from` — как: `picture` — клик по картинке карточки, `menu` — «Открыть» в меню «⋯» или в шторке действий на телефоне. `status` — состояние: `completed` открывает результат, `running` — ожидание, `failed` — экран ошибки. `kind` — одна вещь или образ. Id примерки и место карточки в списке не отправляются.',
      clicksPerVisit: 0.03,
      hoversPerVisit: 0.04,
      properties: {
        from: { kind: 'enum', values: ['picture', 'menu'] },
        status: { kind: 'enum', values: ['completed', 'running', 'failed'] },
        kind: { kind: 'enum', values: ['single', 'look'] },
      },
    },
    'history.menu': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Кнопка «⋯» карточки в «Моих примерках»: открывает меню действий, на телефоне — шторку действий.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.005,
    },
    'history.download': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Скачать» в меню или шторке действий карточки: открывает картинку результата в новой вкладке. Есть только у готовой примерки.',
      clicksPerVisit: 0.004,
      hoversPerVisit: 0.002,
    },
    'history.delete': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Удалить» в подтверждении удаления примерки. «Удалить» в меню или шторке действий, которое открывает подтверждение, и «Отмена» не отслеживаются. `status` — состояние удалённой примерки (идущую удалить нельзя), `kind` — одна вещь или образ.',
      clicksPerVisit: 0.002,
      hoversPerVisit: 0.002,
      properties: {
        status: { kind: 'enum', values: ['completed', 'failed'] },
        kind: { kind: 'enum', values: ['single', 'look'] },
      },
    },
    'history.choose-item': {
      zone: 'fitting',
      type: 'navigation',
      description:
        '«Выбрать вещь для примерки» в пустом списке «Моих примерок»: ведёт в `/catalog`.',
      clicksPerVisit: 0.005,
      hoversPerVisit: 0.005,
    },
  },
});
