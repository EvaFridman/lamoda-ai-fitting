// What the tokens section shows. The values themselves live in shared/styles/tokens.scss; `value`
// here is the caption under a swatch and must match that file.

export interface ColorToken {
  token: `--${string}`;
  name: string;
  value: string;
}

export interface ColorGroup {
  title: string;
  tokens: ColorToken[];
}

export const colorGroups: ColorGroup[] = [
  {
    title: 'Текст',
    tokens: [
      { token: '--color-text', name: 'Основной', value: '#000' },
      { token: '--color-text-secondary', name: 'Второстепенный', value: '#888' },
      { token: '--color-text-disabled', name: 'Недоступный', value: '#ccc' },
    ],
  },
  {
    title: 'Акцент и статусы',
    tokens: [
      { token: '--color-accent', name: 'Акцент', value: '#f93c00' },
      { token: '--color-accent-hover', name: 'Акцент при наведении', value: '#db0d00' },
      { token: '--color-error', name: 'Ошибка', value: '#c20000' },
      { token: '--color-success', name: 'Успех', value: '#00a200' },
      { token: '--color-caution', name: 'Внимание', value: '#be5b04' },
    ],
  },
  {
    title: 'Фон',
    tokens: [
      { token: '--color-background', name: 'Основной', value: '#fff' },
      { token: '--color-background-secondary', name: 'Второстепенный', value: '#f5f5f5' },
      { token: '--color-background-tertiary', name: 'Третичный', value: '#e5e5e5' },
      {
        token: '--color-switch-track',
        name: 'Выключенный переключатель',
        value: 'rgb(186 186 186 / 50%)',
      },
    ],
  },
  {
    title: 'Границы',
    tokens: [
      { token: '--color-border', name: 'Разделитель', value: '#e5e5e5' },
      { token: '--color-border-neutral', name: 'Нейтральная', value: '#ccc' },
      { token: '--color-border-control', name: 'Поле и список', value: '#888' },
      { token: '--color-border-active', name: 'Наведение и фокус', value: '#000' },
    ],
  },
  {
    title: 'Бейджи и подложка',
    tokens: [
      { token: '--color-badge-club-text', name: 'Клуб, текст', value: '#3c5064' },
      { token: '--color-badge-club', name: 'Клуб', value: '#cde6ff' },
      { token: '--color-badge-premium', name: 'Премиум', value: '#000' },
      { token: '--color-badge-promo', name: 'Промо', value: '#a5d2a0' },
      { token: '--color-overlay', name: 'Подложка', value: 'rgb(0 0 0 / 50%)' },
    ],
  },
  {
    title: 'Фильтр по цвету',
    tokens: [
      { token: '--color-swatch-black', name: 'Черный', value: '#000' },
      { token: '--color-swatch-gray', name: 'Серый', value: '#b6b6b6' },
      { token: '--color-swatch-white', name: 'Белый', value: '#fff' },
      { token: '--color-swatch-beige', name: 'Бежевый', value: '#dfbd93' },
      { token: '--color-swatch-red', name: 'Красный', value: '#e50101' },
      { token: '--color-swatch-pink', name: 'Розовый', value: '#ff9bd5' },
      { token: '--color-swatch-orange', name: 'Оранжевый', value: '#ff7a01' },
      {
        token: '--color-swatch-multicolor',
        name: 'Мультиколор',
        value: 'conic-gradient(#ff7a01 25%, #22bd63 25% 50%, #e50101 50% 75%, #3972fc 0)',
      },
      { token: '--color-swatch-yellow', name: 'Желтый', value: '#ffec1c' },
      { token: '--color-swatch-green', name: 'Зеленый', value: '#3db801' },
      { token: '--color-swatch-navy-blue', name: 'Синий', value: '#3972fc' },
      { token: '--color-swatch-blue', name: 'Голубой', value: '#8bcdff' },
      { token: '--color-swatch-purple', name: 'Фиолетовый', value: '#6c2ee9' },
      { token: '--color-swatch-vinous', name: 'Бордовый', value: '#90011b' },
      { token: '--color-swatch-coral', name: 'Коралловый', value: '#ff616f' },
      { token: '--color-swatch-turquoise', name: 'Бирюзовый', value: '#38e2da' },
      { token: '--color-swatch-fuchsia', name: 'Фуксия', value: '#f0f' },
      { token: '--color-swatch-gold', name: 'Золотой', value: '#d7b551' },
      { token: '--color-swatch-silver', name: 'Серебряный', value: '#d1d2ce' },
      { token: '--color-swatch-khaki', name: 'Хаки', value: '#8c9448' },
      { token: '--color-swatch-brown', name: 'Коричневый', value: '#743d02' },
      { token: '--color-swatch-transparent', name: 'Прозрачный', value: '#fff' },
    ],
  },
];

export interface TypeStyle {
  // The suffix of --font-size-* and --line-height-*.
  name: string;
  size: number;
  lineHeight: number;
}

export const typeScale: TypeStyle[] = [
  { name: 'headline-l', size: 32, lineHeight: 40 },
  { name: 'headline-m', size: 24, lineHeight: 28 },
  { name: 'headline-s', size: 20, lineHeight: 24 },
  { name: 'body-m', size: 16, lineHeight: 20 },
  { name: 'body-s', size: 13, lineHeight: 16 },
  { name: 'caption', size: 11, lineHeight: 16 },
];

export const fontWeights = [
  { token: '--font-weight-regular', name: 'Обычный', value: 400 },
  { token: '--font-weight-medium', name: 'Средний', value: 500 },
  { token: '--font-weight-bold', name: 'Жирный', value: 700 },
] as const;

export const spacing = [
  { token: '--space-1', value: 4 },
  { token: '--space-2', value: 8 },
  { token: '--space-3', value: 12 },
  { token: '--space-4', value: 16 },
  { token: '--space-6', value: 24 },
  { token: '--space-8', value: 32 },
  { token: '--space-12', value: 48 },
] as const;

export const shadows = [
  { token: '--shadow-popover', name: 'Всплывающее окно', value: '0 2px 8px rgb(0 0 0 / 8%)' },
  { token: '--shadow-box', name: 'Блок', value: '0 0 8px rgb(0 0 0 / 16%)' },
  { token: '--shadow-modal', name: 'Модальное окно', value: '0 2px 48px rgb(0 0 0 / 24%)' },
  {
    token: '--shadow-thumb',
    name: 'Бегунок переключателя',
    value: '0 1px 1px rgb(0 0 0 / 14%), 0 2px 1px rgb(0 0 0 / 12%), 0 1px 3px rgb(0 0 0 / 20%)',
  },
] as const;
