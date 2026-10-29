// Every analytics event, its properties and every tracked element (spec 0015 R3): the types
// `track` and `useTrackedElement` accept are derived from it (`events.ts`), so sending anything
// else fails `npm run typecheck`. Plain data with no imports: tests and the events document read
// it as it is. Page views are Mixpanel's own `$mp_web_page_view`, sent by the SDK.

/** What an entry serves (R4): `conversion` only for an event of a reached goal. */
export type EntryType = 'navigation' | 'interaction' | 'conversion' | 'service';

/** A property is a closed list, a number or a boolean: never free text (R7, AC6). */
// `optional`: sent only with some sends of its event (its description says which); every other
// property goes with every send.
export type Property = (
  { kind: 'enum'; values: readonly string[] } | { kind: 'number' } | { kind: 'boolean' }
) & { optional?: true };

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

// Where the profile menu's item was chosen: the header's menu or, on phones, the burger's drawer
// (spec 0019 A87.8). Sends from before the burger carry no `surface` and were all the menu.
const profileSurface = { kind: 'enum', values: ['menu', 'burger'] } as const;
const profileSurfaceNote =
  '`surface` — `menu` (меню профиля) или `burger` (меню-бургер шапки на телефоне). До спеки 0019 A87 свойства не было и все отправки были из меню, так что отчёт по меню фильтрует `surface != burger`, а не `surface == menu`.';

// A fitting room's slot (spec 0019 A86): a class of categories, not a product.
const slot = {
  kind: 'enum',
  values: ['top', 'bottom', 'outerwear', 'shoes', 'accessory'],
} as const;
// What a hanger's, «Добавить к образу»'s or the result's «К образу»'s click does, from the room already read (spec 0019 A90.9).
const lookAction = { kind: 'enum', values: ['add', 'replace', 'remove'] } as const;
const toLookNote =
  '`slot` — слот вещи. `action` — что делает клик: `add` кладёт вещь в пустой слот, `replace` заменяет вещь слота (придёт уведомление с «Вернуть»), `remove` убирает эту вещь. `signed_in` — вошёл ли посетитель: `false` открывает окно входа (придёт и `Login Opened`), `action` тогда `add`. Пока загружаются сессия и примерочная, кнопка отключена и ничего не шлёт. Id товара и цвет не отправляются.';

/** Checks a catalog and keeps its literal types. */
export function defineCatalog<const C extends Catalog>(catalog: C & Checked<C>): C {
  return catalog;
}

export const catalog = defineCatalog({
  // The owner's estimates (R15, R17), set without traffic data: a demo site. The SDK sends about
  // 5 page views and 7 heatmap clicks a visit (`autocapture` is off; the catalog's categories are
  // paths of their own, spec 0014 O102); «Мои фото» adds about one more, «Мои примерки» another,
  // the product page another, the fittings' compare page another (spec 0019 plan §9, A78, A84,
  // A93), the stores page another (spec 0022 X17).
  visitsPerMonth: 3_000,
  sdkPerVisit: 17,
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
        'Вход через Google и выход. `login` — окно входа, `profile-menu` — меню профиля в шапке (его пункты есть и в меню-бургере телефона, `surface` их различает).',
    },
    header: {
      title: 'Шапка',
      areas: ['header', 'burger', 'city'],
      description:
        'Шапка сайта. `header` — строка шапки на телефоне (спека 0019 A87): бургер и лупа; `burger` — меню-бургер слева: «Все товары» и категории; `city` — город посетителя (спека 0026): кнопка в шапке, строка бургера и «Изменить город» страницы магазинов открывают окно «Ваш город», в нём «Определить автоматически» и список городов. Ни одно свойство не называет город и не несёт координат. Логотип, «Избранное» и «Корзина» не отслеживаются; «Войти» бургера считает `Login Opened`, его разделы кабинета и выходы — элементы `profile-menu` с `surface: burger`.',
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
        'Страницы `/catalog` и `/catalog/<slug>`: список категорий слева, ряд фильтров над сеткой (на узком экране — шторка «Фильтры»), сетка карточек и вешалка «Добавить к образу» на них.',
    },
    product: {
      title: 'Страница товара',
      areas: ['buy-box', 'related', 'gallery'],
      description:
        'Страница `/products/<id>` (спека 0019). `gallery` — фото товара (спека 0023): щелчок открывает их во весь экран, наведение мышью — лупа. `buy-box` — блок покупки справа от галереи (на телефоне под ней): «Добавить в корзину», «В избранное», «Примерить», «Добавить к образу» («В образе»), «Вы это примеряли». `related` — «С этим товаром выбирают» под ним: один ряд компактных карточек, их вешалка, «В корзину» и стрелки ряда. «Показать ещё фото», полноэкранный просмотр, «О товаре» и хлебные крошки не отслеживаются; окно примерки, открытое отсюда, шлёт элементы и события зоны `fitting`.',
    },
    fitting: {
      title: 'Примерка',
      areas: ['photos', 'try-on', 'result', 'fitting-toast', 'history', 'compare', 'room'],
      description:
        'Онлайн-примерка (спека 0019). `photos` — фото для примерки: загрузка (подсказки и согласия первой загрузки, экран отказа) и страница «Мои фото» (`/customer/photos`). `try-on` — окно примерки до результата: выбор фото, ожидание, экраны лимита и ошибок. `result` — результат примерки (после экрана «Готово!», со строкой «Сохранено в «Мои примерки»») и шторка «Что поменять?». `fitting-toast` — уведомления «Примерка готова» и «Примерка … не удалась» на любой странице сайта. `history` — «Мои примерки» (`/customer/fittings`): вкладки, карточки, меню и шторка действий карточки, «Примерить ещё раз», режим выбора для сравнения, подтверждение удаления, пустой список. `compare` — страница сравнения двух примерок (`/customer/fittings/compare`): «Открыть» и «В корзину» колонок; сердце и «Поделиться» не отслеживаются. `room` — примерочная: значок в шапке со счётчиком и шторка справа (на телефоне на весь экран): слоты, сердце «В избранное», «Убрать», «Вернуть», «Подобрать в каталоге» и «+» пустого слота, «Очистить примерочную», «Добавить образ в корзину».',
    },
    stores: {
      title: 'Магазины Lamoda Sport',
      areas: ['stores'],
      description:
        'Страница `/customer/stores` (спека 0022), открытая всем: поиск, список карточек магазинов и их подробности, карта Яндекса с пинами, на экране уже 1024 px вкладки «Список» и «Карта». Ни одно свойство не называет магазин: ни город, ни место карточки, ни тип магазина. Пункт «Магазины» в меню кабинета — `account-menu.section` с `section: stores`.',
    },
    footer: {
      title: 'Подвал',
      areas: ['footer'],
      description:
        'Подвал сайта (спека 0008 J22): колонки пунктов, как у Lamoda. Отслеживаются пункты со страницей, кроме политики по работе с персональными данными; пока это «Магазины Lamoda Sport» (спека 0022 X18).',
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
        'Фото для примерки загружено и прошло проверку: после ответа api. `saved` — сохранено в «Мои фото» (не одноразовое; со спеки 0024 в окне примерки фото всегда одноразовое, `false`, а сохраняет его переключатель на результате, `result.save-photo`), `source` — выбрано из файлов (`file`), снято камерой (`camera`), перетащено на зону загрузки в окне примерки (`drop`) или вставлено там Ctrl/Cmd+V (`paste`, со спеки 0024), `place` — где загружено: `photos` — страница «Мои фото», `try-on` — выбор фото в окне примерки, `first` — загрузка, которая отправила согласия (с подсказками и согласиями; раз на аккаунт, до спеки 0023 — раз на браузер), `format` — формат выбранного файла до преобразования: `jpeg`, `png`, `webp` или `heic` (HEIC браузер переводит в JPEG перед загрузкой; со спеки 0024, в более ранних событиях его нет). Само фото и ссылка на него не отправляются.',
      perVisit: 0.012,
      properties: {
        saved: { kind: 'boolean' },
        source: { kind: 'enum', values: ['file', 'camera', 'drop', 'paste'] },
        place: { kind: 'enum', values: ['photos', 'try-on'] },
        first: { kind: 'boolean' },
        format: { kind: 'enum', values: ['jpeg', 'png', 'webp', 'heic'] },
      },
    },
    'Photo Refused': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Проверка не пропустила фото: после ответа api. `reason` — причина: `dark` слишком темно, `not_full` не в полный рост, `many_people` больше одного человека, `child` похоже на ребёнка, `no_person` нет человека, `moderation` не прошло модерацию, `other` причина не распознана. `source`, `place`, `first`, `format` — как у `Photo Uploaded`.',
      perVisit: 0.005,
      properties: {
        reason: {
          kind: 'enum',
          values: ['dark', 'not_full', 'many_people', 'child', 'no_person', 'moderation', 'other'],
        },
        source: { kind: 'enum', values: ['file', 'camera', 'drop', 'paste'] },
        place: { kind: 'enum', values: ['photos', 'try-on'] },
        first: { kind: 'boolean' },
        format: { kind: 'enum', values: ['jpeg', 'png', 'webp', 'heic'] },
      },
    },
    'Fitting Started': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Примерка запущена: после ответа api (новая, идущая или уже готовая с тем же фото, вещами и цветами). Экран ожидания показывается уже при нажатии, до ответа (спека 0024); событие — только когда api принял запуск, один раз и после тихого повтора, а отказ или ошибка его не отправляют. `kind` — одна вещь или образ, `source` — каким действием: `picker` — «Примерить» на выборе фото, `retry` — «Попробовать ещё раз» на экране ошибки или «Повторить» в уведомлении, `colour` — другой цвет на результате, `regenerate` — «Перегенерировать», `history` — «Примерить ещё раз» в «Моих примерках». `items` — сколько вещей, `repeated` — api открыл готовый результат без списания, `with_prompt` — есть пожелания или комментарий перегенерации (сам текст не отправляется).',
      perVisit: 0.03,
      properties: {
        kind: { kind: 'enum', values: ['single', 'look'] },
        source: { kind: 'enum', values: ['picker', 'retry', 'colour', 'regenerate', 'history'] },
        items: { kind: 'number' },
        repeated: { kind: 'boolean' },
        with_prompt: { kind: 'boolean' },
      },
    },
    'Fitting Start Retried': {
      zone: 'fitting',
      type: 'service',
      description:
        'Запуск примерки (также «Примерить ещё раз» в «Моих примерках»), перегенерации или смены цвета не получил ответа и был тихо отправлен ещё раз через 1,5 с (спека 0024); отправляется, когда повтор закончился. `kind` и `source` — как у `Fitting Started`, `cause` — первая неудача: `network` — нет ответа, `timeout` — истекло время ожидания, `server` — 502, 503 или 504. `outcome` — чем кончился повтор: `started` — примерка запущена (или api открыл уже идущую), `refused` — отказ лимита или текста (ушёл и `Fitting Refused`), `failed` — экран ошибки.',
      perVisit: 0.001,
      properties: {
        kind: { kind: 'enum', values: ['single', 'look'] },
        source: { kind: 'enum', values: ['picker', 'retry', 'colour', 'regenerate', 'history'] },
        cause: { kind: 'enum', values: ['network', 'timeout', 'server'] },
        outcome: { kind: 'enum', values: ['started', 'refused', 'failed'] },
      },
    },
    'Fitting Completed': {
      zone: 'fitting',
      type: 'conversion',
      description:
        'Результат примерки готов: вкладка, которая её запустила или видела идущей, узнала статус `completed` (если при этом открыто окно примерки, видевшее её идущей, оно показывает экран «Готово!»); один раз на генерацию. `model` — модель (неизвестная — `other`), `duration` — секунды от создания до результата (у готового результата, открытого повтором, 0), `counts_against_limit` — списана ли примерка месяца, `repeated` — открыт готовый результат.',
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
        'Api не запустил примерку или перегенерацию: `limit_reached` — примерки месяца закончились, `prompt_refused` — пожелания или комментарий не прошли проверку. Генерации не было, примерка не списана. `prompt_reason` — только с `prompt_refused`, грубая группа причины: `other_people` — другие люди, `minors` — дети, `unsafe` — тело, насилие, оскорбления или запрещённое, `off_topic` — не про образ, политика или причина не распознана.',
      perVisit: 0.003,
      properties: {
        kind: { kind: 'enum', values: ['single', 'look'] },
        reason: { kind: 'enum', values: ['limit_reached', 'prompt_refused'] },
        prompt_reason: {
          kind: 'enum',
          values: ['other_people', 'minors', 'unsafe', 'off_topic'],
          optional: true,
        },
      },
    },
    'Stores Searched': {
      zone: 'stores',
      type: 'interaction',
      description:
        'Посетитель искал магазин: через секунду после последнего изменения текста в поле «Магазин, адрес или метро». Пустой текст и тот же текст, что в прошлый раз, не отправляются. `query_length` — длина текста без пробелов по краям, `results` — сколько магазинов осталось в списке из показанных, `scope` — что страница показывала (спека 0026): магазины выбранного города (`city`) или все (`all`, также без выбранного города); у отправок до неё `scope` нет. Сам текст и город не отправляются, текст в адрес страницы не попадает.',
      perVisit: 0.03,
      properties: {
        query_length: { kind: 'number' },
        results: { kind: 'number' },
        scope: { kind: 'enum', values: ['city', 'all'] },
      },
    },
    'City Located': {
      zone: 'stores',
      type: 'interaction',
      description:
        'Конец поиска города по геопозиции (спека 0026): страница магазинов спросила сама при первом открытии без города (`trigger: page`) или посетитель нажал «Определить автоматически» (`button`). `result`: `found` — выбран город ближайшего магазина, `far` — ни одного магазина ближе 100 км, `refused` — доступ к геопозиции запрещён, `failed` — не удалось определить (ошибка, 10 секунд без ответа после разрешения или 30 секунд без ответа на запрос, нет геолокации в браузере). Ни город, ни координаты, ни расстояние не отправляются.',
      perVisit: 0.025,
      properties: {
        result: { kind: 'enum', values: ['found', 'far', 'refused', 'failed'] },
        trigger: { kind: 'enum', values: ['page', 'button'] },
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
      description: `«Выйти» в меню профиля или в меню-бургере. ${profileSurfaceNote}`,
      clicksPerVisit: 0.02,
      hoversPerVisit: 0.03,
      properties: { surface: profileSurface },
    },
    'profile-menu.sign-out-everywhere': {
      zone: 'auth',
      type: 'interaction',
      description: `«Выйти со всех устройств» в меню профиля или в меню-бургере. ${profileSurfaceNote}`,
      clicksPerVisit: 0.005,
      hoversPerVisit: 0.01,
      properties: { surface: profileSurface },
    },
    'profile-menu.section': {
      zone: 'auth',
      type: 'navigation',
      description: `Раздел личного кабинета в меню профиля или в меню-бургере: «Мои заказы», «Магазины», «Мои данные», «Мои примерки» или «Мои фото». ${profileSurfaceNote}`,
      clicksPerVisit: 0.04,
      hoversPerVisit: 0.06,
      properties: {
        section: { kind: 'enum', values: ['orders', 'stores', 'data', 'fittings', 'photos'] },
        surface: profileSurface,
      },
    },
    'header.burger': {
      zone: 'header',
      type: 'interaction',
      description:
        'Бургер в строке шапки на телефоне: открывает меню слева. `signed_in` — вошёл ли посетитель (сверху меню «Войти» или его имя).',
      clicksPerVisit: 0.3,
      hoversPerVisit: 0.05,
      properties: { signed_in: { kind: 'boolean' } },
    },
    'header.search': {
      zone: 'header',
      type: 'interaction',
      description:
        'Лупа в строке шапки на телефоне: открывает и закрывает строку поиска под шапкой. `expanded` — состояние, которое ставит клик (`true` — строку открыли).',
      clicksPerVisit: 0.2,
      hoversPerVisit: 0.05,
      properties: { expanded: { kind: 'boolean' } },
    },
    'city.open': {
      zone: 'header',
      type: 'interaction',
      description:
        'Открытие окна «Ваш город»: кнопка города в шапке (`source: header`), строка «Город» в меню-бургере (`burger`) или «Изменить город» / «Выбрать город» на странице магазинов (`stores`). `had_city` — был ли город уже выбран.',
      clicksPerVisit: 0.05,
      hoversPerVisit: 0.08,
      properties: {
        source: { kind: 'enum', values: ['header', 'burger', 'stores'] },
        had_city: { kind: 'boolean' },
      },
    },
    'city.pick': {
      zone: 'header',
      type: 'interaction',
      description:
        'Город в списке окна «Ваш город» (один элемент на все строки): выбирает его и закрывает окно. Какой город и место строки не отправляются. `searched` — был ли в поле поиска текст, `had_city` — был ли город выбран до этого.',
      clicksPerVisit: 0.03,
      hoversPerVisit: 0.03,
      properties: { searched: { kind: 'boolean' }, had_city: { kind: 'boolean' } },
    },
    'city.auto': {
      zone: 'header',
      type: 'interaction',
      description:
        '«Определить автоматически» в окне «Ваш город»: браузер спрашивает разрешение на геопозицию, чем всё кончилось — событие `City Located` с `trigger: button`. `had_city` — был ли город выбран до этого.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.01,
      properties: { had_city: { kind: 'boolean' } },
    },
    'burger.category': {
      zone: 'header',
      type: 'navigation',
      description:
        'Ссылка каталога в меню-бургере: «Все товары» (`all: true`) или одна из категорий (`all: false`; какая — не шлётся, её видно по следующей странице).',
      clicksPerVisit: 0.25,
      hoversPerVisit: 0.05,
      properties: { all: { kind: 'boolean' } },
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
    'catalog.to-look': {
      zone: 'catalog',
      type: 'interaction',
      description: `Вешалка в левом верхнем углу карточки сетки (только у товаров со слотом); карточку она не открывает и \`catalog.card\` не шлёт. Место карточки не отправляется. ${toLookNote}`,
      clicksPerVisit: 0.1,
      hoversPerVisit: 0.3,
      properties: { slot, action: lookAction, signed_in: { kind: 'boolean' } },
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
        'Категория в списке слева или в шторке «Категории» на экране уже 600 px: ссылка на `/catalog/<slug>`, в шторке также первая строка «Все товары» (`/catalog`). Одна на все строки обоих списков: наведение уходит раз за просмотр страницы. Категории в шапке не отслеживаются.',
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
        'Строка с текущей категорией («⌄ Одежда», «Все товары» на `/catalog`) на экране уже 600 px: открывает шторку «Категории» снизу (закрывается она свайпом, фоном или выбором, не этой строкой). `expanded` — состояние, в которое переводит клик: с 0024 всегда `true`, `false` было в отправках, пока список раскрывался под строкой.',
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
    'buy-box.to-look': {
      zone: 'product',
      type: 'interaction',
      description: `«Добавить к образу» / «В образе» в блоке покупки (только у товаров со слотом; до спеки 0023 подпись была «К образу»). ${toLookNote}`,
      clicksPerVisit: 0.04,
      hoversPerVisit: 0.06,
      properties: { slot, action: lookAction, signed_in: { kind: 'boolean' } },
    },
    'related.to-look': {
      zone: 'product',
      type: 'interaction',
      description: `Вешалка на карточке в «С этим товаром выбирают»; карточку она не открывает и \`related.card\` не шлёт. Один элемент на все карточки: наведение уходит раз за просмотр страницы на набор свойств. ${toLookNote}`,
      clicksPerVisit: 0.02,
      hoversPerVisit: 0.05,
      properties: { slot, action: lookAction, signed_in: { kind: 'boolean' } },
    },
    'related.card': {
      zone: 'product',
      type: 'navigation',
      description:
        'Карточка в «С этим товаром выбирают»: ссылка на страницу товара. `position` — её место в блоке, с 1 (не больше 6); id товара не отправляется. Вешалка (`related.to-look`), сердце и «В корзину» карточки — не ссылка и этот элемент не шлют.',
      clicksPerVisit: 0.08,
      hoversPerVisit: 0.4,
      properties: { position: { kind: 'number' } },
    },
    'gallery.photo': {
      zone: 'product',
      type: 'interaction',
      description:
        'Фото в галерее страницы товара (и слайд ленты на телефоне): щелчок открывает фото во весь экран, наведение мышью (только устройство с мышью) — лупа. `position` — номер фото в галерее, с 1; id фото и товара не отправляются. Стрелки, свайпы и закрытие полноэкранного просмотра ничего не шлют.',
      clicksPerVisit: 0.1,
      hoversPerVisit: 0.6,
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
        '«Добавить фото» или «Выбрать фото» (на странице «Мои фото»), «Загрузить фото» или нажатие на зону загрузки (на выборе фото и в окне «Заменить фото» в окне примерки): открывает выбор файла, а при первой загрузке — подсказки и согласия. Перетаскивание файла на зону и вставка не отслеживаются: это `Photo Uploaded` с `source: drop` и `source: paste`.',
      clicksPerVisit: 0.02,
      hoversPerVisit: 0.02,
    },
    'photos.camera': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Сделать фото»: на телефоне открывает камеру, на компьютере — выбор файла. В окне примерки показывается только на сенсорном устройстве (`pointer: coarse`), на странице «Мои фото» — везде.',
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
        'Фото в окне «Заменить фото» или «Выбрать из сохранённых» (выбранного для примерки там нет): выбирает его для примерки и закрывает окно. `is_default` — фото по умолчанию.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.01,
      properties: { is_default: { kind: 'boolean' } },
    },
    'try-on.replace-photo': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Заменить фото» под выбранным фото или «Выбрать из сохранённых» под пустой зоной (после «Примерить на другом фото», пока есть фото): открывает окно с остальными фото и загрузкой нового.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.008,
    },
    'try-on.favourite': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Сердце «В избранное» у карточки вещи на выборе фото: заглушка, не остаётся нажатым, показывает уведомление. `kind` — примерка одной вещи (`single`) или образа (`look`).',
      clicksPerVisit: 0.003,
      hoversPerVisit: 0.005,
      properties: { kind: { kind: 'enum', values: ['single', 'look'] } },
    },
    'try-on.start': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Примерить» или «Примерить образ» на выборе фото (одна вещь или образ различаются по `kind` у `Fitting Started`).',
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
        'Закрытие окна примерки кнопкой: `wait` — «Закрыть и продолжить покупки» во время ожидания, `error` — «Закрыть» на экране ошибки. Крестик и Esc не отслеживаются.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.005,
      properties: { screen: { kind: 'enum', values: ['wait', 'error'] } },
    },
    'try-on.other-photo': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Другое фото» («Выбрать другое фото» на телефоне) на экране «Не можем показать результат»: назад к выбору фото, с пустой зоной загрузки и без выбранного фото.',
      clicksPerVisit: 0.001,
      hoversPerVisit: 0.001,
    },
    'result.download': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Плитка «Скачать» под результатом: сохраняет картинку файлом (до спеки 0023 открывала её в новой вкладке) и показывает «Фото скачано». Клик, пока файл грузится, не отправляется.',
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
    'result.regenerate': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Перегенерировать» в шторке «Что поменять?». `with_comment` — есть ли набранный комментарий (сам текст не отправляется), `with_item` — выбрана ли вещь образа в «Какая именно?» (отправки до этого свойства его не имеют, поэтому отчёт фильтрует `with_item == true`, а не `!= false`; до релиза спеки 0023 выбор был только после причины «Вещь», так что отчёты режутся по дате релиза), `free` — бесплатна ли эта перегенерация. До спеки 0023 отправки несли ещё `reasons`, число отмеченных причин; чипов причин больше нет.',
      clicksPerVisit: 0.004,
      hoversPerVisit: 0.003,
      properties: {
        with_comment: { kind: 'boolean' },
        with_item: { kind: 'boolean' },
        free: { kind: 'boolean' },
      },
    },
    'result.add-to-cart': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Добавить в корзину» («В корзину» на телефоне) у вещи результата: заглушка, показывает уведомление, что в прототипе нет корзины. `kind` — результат одной вещи или строка вещи в образе; отправки до этого свойства все про одну вещь, поэтому отчёт по образу фильтрует `kind == look`, а по одной вещи `kind != look`.',
      clicksPerVisit: 0.005,
      hoversPerVisit: 0.008,
      properties: { kind: { kind: 'enum', values: ['single', 'look'] } },
    },
    'result.add-to-cart-all': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Добавить образ в корзину» на результате образа, рядом с сердечком «Добавить образ в избранное» (одна вёрстка на всех ширинах; до спеки 0024 на телефоне была ещё кнопка в шторке «Вещи образа», до спеки 0023 — «Всё в корзину»): заглушка, показывает уведомление, что в прототипе нет корзины. `items` — сколько вещей в образе.',
      clicksPerVisit: 0.004,
      hoversPerVisit: 0.006,
      properties: { items: { kind: 'number' } },
    },
    'result.item-colour': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Другой цвет вещи в «Вещах образа» (карточки вещей одинаковые на всех ширинах, у вещи одного цвета кружков нет; до спеки 0024 на телефоне — в шторке «Вещи образа»): весь образ примеряется заново на том же фото (сама примерка — `Fitting Started` с `source: colour`). `slot` — слот вещи. Текущий цвет и отключённые кружки ничего не шлют, вещь без слота тоже. Id товара и цвет не отправляются. Наведение — на ряд кружков вещи.',
      clicksPerVisit: 0.003,
      hoversPerVisit: 0.005,
      properties: { slot },
    },
    'result.to-look': {
      zone: 'fitting',
      type: 'interaction',
      description: `Плитка «К образу» / «В образе» под результатом одной вещи (у результата образа её нет). ${toLookNote} Здесь \`signed_in\` всегда \`true\`: примерка только у вошедшего.`,
      clicksPerVisit: 0.005,
      hoversPerVisit: 0.008,
      properties: { slot, action: lookAction, signed_in: { kind: 'boolean' } },
    },
    'result.other-photo': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Примерить на другом фото»: назад к выбору фото в том же окне, с пустой зоной загрузки и без выбранного фото.',
      clicksPerVisit: 0.002,
      hoversPerVisit: 0.002,
    },
    'result.save-photo': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Переключатель «Сохранить фото для следующих примерок» в правой колонке результата одной вещи и образа (со спеки 0024; на выборе фото его больше нет): показан у результата на одноразовом фото, включён по умолчанию, и открытый результат сохраняет фото в «Мои фото» сам (это не отправляется). `saved` — что делает клик: `true` снова сохраняет фото, `false` делает его одноразовым (оно удалится, когда окно закроется); наведение несёт то же значение. При пяти сохранённых фото переключатель выключен и не нажимается.',
      clicksPerVisit: 0.003,
      hoversPerVisit: 0.003,
      properties: { saved: { kind: 'boolean' } },
    },
    'result.history': {
      zone: 'fitting',
      type: 'navigation',
      description:
        'Ссылка «Мои примерки» в строке «Сохранено в «Мои примерки»» под картинкой результата (одной вещи и образа): уходит на страницу истории примерок.',
      clicksPerVisit: 0.003,
      hoversPerVisit: 0.003,
    },
    'fitting-toast.open': {
      zone: 'fitting',
      type: 'navigation',
      description:
        '«Открыть» в уведомлении «Примерка готова» или «Такая примерка уже есть» (повтор из «Моих примерок»): открывает результат. `kind` — одна вещь или образ.',
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
    'room.open': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Открытие примерочной. `source` — откуда: `header` — значок «Примерочная» в шапке, `toast` — «Открыть» в уведомлении «… в примерочной», `limit` — «Перейти в примерочную» на карточке лимита в окне примерки, `picker` — «Изменить» у образа на выборе фото, `result` — «Заменить» на карточке вещи в результате образа (окно примерки закрывается, примерочная прокручивается к слоту вещи; слот не отправляется; до спеки 0024 — ссылка «Заменить вещь в примерочной» под вещами). `items` — сколько вещей в примерочной (0–5).',
      clicksPerVisit: 0.085,
      hoversPerVisit: 0.055,
      properties: {
        source: { kind: 'enum', values: ['header', 'toast', 'limit', 'picker', 'result'] },
        items: { kind: 'number' },
      },
    },
    'room.remove': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Убрать» у слота в примерочной (на телефоне ×). `slot` — какой слот. Снятие вешалкой или «В образе» шлёт `*.to-look` с `action: remove`.',
      clicksPerVisit: 0.02,
      hoversPerVisit: 0.02,
      properties: { slot },
    },
    'room.undo': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Вернуть» в уведомлении: возвращает вещь после замены (`action: replace`) или удаления (`action: remove`). `slot` — какой слот.',
      clicksPerVisit: 0.005,
      hoversPerVisit: 0.003,
      properties: { slot, action: { kind: 'enum', values: ['replace', 'remove'] } },
    },
    'room.fill': {
      zone: 'fitting',
      type: 'navigation',
      description:
        '«Подобрать в каталоге» или «+» у пустого слота (с 0023 и «+»): ведут в первую активную категорию слота. У аксессуаров ссылки нет, поэтому `accessory` не приходит. `slot` — какой слот.',
      clicksPerVisit: 0.015,
      hoversPerVisit: 0.015,
      properties: { slot },
    },
    'room.favourite': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Сердце «В избранное» у вещи в слоте примерочной: заглушка, не остаётся нажатым, показывает уведомление. `slot` — какой слот.',
      clicksPerVisit: 0.003,
      hoversPerVisit: 0.008,
      properties: { slot },
    },
    'room.clear': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Очистить примерочную» (на компьютере внизу шторки, на телефоне в меню «…»), без подтверждения. `items` — сколько вещей убрано.',
      clicksPerVisit: 0.003,
      hoversPerVisit: 0.003,
      properties: { items: { kind: 'number' } },
    },
    'room.add-to-cart-all': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Добавить образ в корзину» (до 0023 «Всё в корзину») в примерочной: заглушка, показывает уведомление, что в прототипе нет корзины. `items` — сколько вещей в примерочной.',
      clicksPerVisit: 0.008,
      hoversPerVisit: 0.01,
      properties: { items: { kind: 'number' } },
    },
    'room.try-on': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Примерить образ» в примерочной: шторка закрывается, открывается выбор фото для образа (сама примерка — `Fitting Started` с `kind: look`). `items` — сколько вещей в примерочной.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.01,
      properties: { items: { kind: 'number' } },
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
        '«Скачать» в меню или шторке действий карточки: сохраняет картинку результата файлом (до спеки 0023 открывала её в новой вкладке) и показывает «Фото скачано». Есть только у готовой примерки.',
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
    'history.repeat': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«Примерить ещё раз» в меню «⋯» или шторке действий карточки «Моих примерок»: запускает примерку с теми же фото, вещами и пожеланиями (сам запуск — `Fitting Started` с `source: history`; готовый результат открывается без списания, `repeated: true`). Выключена, когда фото удалено. `kind` — одна вещь или образ, `status` — состояние карточки.',
      clicksPerVisit: 0.003,
      hoversPerVisit: 0.002,
      properties: {
        kind: { kind: 'enum', values: ['single', 'look'] },
        status: { kind: 'enum', values: ['completed', 'failed'] },
      },
    },
    'history.compare': {
      zone: 'fitting',
      type: 'interaction',
      description:
        'Вход в режим выбора для сравнения. `from` — откуда: `button` — «Сравнить» над списком «Моих примерок», `sheet` — «Сравнить с другой» в шторке действий карточки (эта примерка уже отмечена). «Отмена» и отметки карточек не отслеживаются.',
      clicksPerVisit: 0.004,
      hoversPerVisit: 0.004,
      properties: { from: { kind: 'enum', values: ['button', 'sheet'] } },
    },
    'history.compare-open': {
      zone: 'fitting',
      type: 'navigation',
      description:
        '«Сравнить» в режиме выбора (активна при двух отмеченных): открывает страницу сравнения. Id примерок не отправляются и убираются из адресов (`a`, `b`), как `fitting`.',
      clicksPerVisit: 0.002,
      hoversPerVisit: 0.002,
    },
    'compare.open': {
      zone: 'fitting',
      type: 'navigation',
      description:
        '«Открыть» в колонке страницы сравнения: открывает эту примерку. `kind` — одна вещь или образ.',
      clicksPerVisit: 0.002,
      hoversPerVisit: 0.002,
      properties: { kind: { kind: 'enum', values: ['single', 'look'] } },
    },
    'compare.add-to-cart': {
      zone: 'fitting',
      type: 'interaction',
      description:
        '«В корзину» в колонке страницы сравнения (на телефоне «<Цвет> в корзину»): заглушка, показывает уведомление, что в прототипе нет корзины. Один элемент на обе колонки; цвет и товар не отправляются.',
      clicksPerVisit: 0.002,
      hoversPerVisit: 0.003,
    },
    'stores.card': {
      zone: 'stores',
      type: 'interaction',
      description:
        'Карточка магазина в списке (кроме «›»): выбирает магазин. Магазин и место карточки не отправляются.',
      clicksPerVisit: 0.1,
      hoversPerVisit: 0.03,
    },
    'stores.details': {
      zone: 'stores',
      type: 'interaction',
      description:
        '«›» карточки магазина: открывает и закрывает описание, телефоны и «Проложить маршрут». `expanded` — состояние, в которое переводит клик (`true` — подробности открываются).',
      clicksPerVisit: 0.05,
      hoversPerVisit: 0.03,
      properties: { expanded: { kind: 'boolean' } },
    },
    'stores.phone': {
      zone: 'stores',
      type: 'navigation',
      description:
        'Телефон в подробностях магазина: ссылка `tel:`. Номер не отправляется; клик тепловой карты теряет ссылку и текст (`strip-attributes.ts`).',
      clicksPerVisit: 0.0025,
      hoversPerVisit: 0.003,
    },
    'stores.route': {
      zone: 'stores',
      type: 'navigation',
      description:
        '«Проложить маршрут» в подробностях магазина: маршрут Яндекс Карт в новой вкладке. Координаты не отправляются; клик тепловой карты теряет ссылку (`strip-attributes.ts`).',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.01,
    },
    'stores.pin': {
      zone: 'stores',
      type: 'interaction',
      description:
        'Пин «la» магазина на карте: отмечает магазин и прокручивает к нему список, на экране уже 1024 px показывает его карточку поверх карты. Магазин не отправляется; клики по кругу с числом, масштаб и сдвиг карты не отслеживаются.',
      clicksPerVisit: 0.05,
      hoversPerVisit: 0.02,
    },
    'stores.tab': {
      zone: 'stores',
      type: 'interaction',
      description:
        'Вкладки «Список» и «Карта» на экране уже 1024 px. `tab` — выбранная вкладка; переход на «Карта» по клику на карточку не отправляется.',
      clicksPerVisit: 0.03,
      hoversPerVisit: 0,
      properties: { tab: { kind: 'enum', values: ['list', 'map'] } },
    },
    'stores.scope': {
      zone: 'stores',
      type: 'interaction',
      description:
        'Переключатель «<Город>» / «Все города» над поиском, когда город выбран (спека 0026). `scope` — выбранный вид: магазины города (`city`) или все (`all`). Нажатие на текущий вид не отправляется, наведение тоже. Город не отправляется.',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0,
      properties: { scope: { kind: 'enum', values: ['city', 'all'] } },
    },
    'stores.search-all': {
      zone: 'stores',
      type: 'interaction',
      description:
        '«Искать во всех городах» под «Ничего не нашлось», когда в городе поиск ничего не нашёл: показывает магазины всех городов с тем же текстом.',
      clicksPerVisit: 0.003,
      hoversPerVisit: 0.002,
    },
    'footer.link': {
      zone: 'footer',
      type: 'navigation',
      description:
        'Пункт подвала со страницей. `link` — какой: `stores` — «Магазины Lamoda Sport» (`/customer/stores`, загружается целиком).',
      clicksPerVisit: 0.01,
      hoversPerVisit: 0.02,
      properties: { link: { kind: 'enum', values: ['stores'] } },
    },
  },
});
