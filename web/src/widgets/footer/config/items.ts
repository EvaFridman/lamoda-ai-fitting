import { STORES_HREF } from '@/shared/config';

// The footer's columns, copied from Lamoda's site footer (spec 0008 J22). An item without `href`
// has no page yet and renders as plain text; it gets one when its page appears (backlog, "Footer
// links").

export interface FooterItem {
  label: string;
  href?: string;
  // A plain <a>: the page loads in full (the stores page's own policy, spec 0022 X16).
  fullLoad?: boolean;
  // The value of `footer.link`'s `link`: such an item is tracked (spec 0022 X18).
  track?: 'stores';
}

export interface FooterColumn {
  title: string;
  items: FooterItem[];
}

export const footerColumns: FooterColumn[] = [
  {
    title: 'Помощь',
    items: [
      { label: 'Мои заказы' },
      { label: 'Условия доставки' },
      { label: 'Магазины Lamoda Sport', href: STORES_HREF, fullLoad: true, track: 'stores' },
      { label: 'Возврат' },
      { label: 'Как оформить заказ' },
      { label: 'Как выбрать размер' },
      { label: 'Центр поддержки Lamoda' },
      { label: 'Lamoda о мошенничестве' },
      { label: 'Часто задаваемые вопросы' },
      { label: 'Lamoda club' },
      { label: 'Подарочные карты' },
      { label: 'Чат с поддержкой' },
    ],
  },
  {
    title: 'О нас',
    items: [
      { label: 'Новости компании' },
      { label: 'Устойчивое развитие' },
      { label: 'Журнал' },
      { label: 'Вакансии' },
      { label: 'Статьи' },
    ],
  },
  {
    title: 'Партнерам',
    items: [
      { label: 'Lamoda Seller Academy — База знаний для продавцов и партнеров' },
      { label: 'Стать продавцом маркетплейса' },
      { label: 'Продвижение на Lamoda' },
      { label: 'Стать подрядчиком Lamoda' },
      { label: 'Стать подрядчиком для складских операций' },
      { label: 'Стать подрядчиком транспортных услуг' },
      { label: 'Стать подрядчиком для ремонта и эксплуатации ПВЗ' },
      { label: 'Арендодателям' },
      { label: 'Подарочные сертификаты для бизнеса' },
      { label: 'Стать участником Lamoda Fashion Accelerator' },
    ],
  },
  {
    title: 'Правовая информация',
    items: [
      { label: 'Публичная оферта' },
      { label: 'Пользовательское соглашение' },
      { label: 'Сотрудничество' },
      { label: 'Политика по работе с персональными данными', href: '/privacy' },
      { label: 'Конфиденциальная информация' },
      { label: 'Комплаенс' },
      { label: 'Устойчивое развитие' },
    ],
  },
];
