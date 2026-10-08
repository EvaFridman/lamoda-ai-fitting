import { Accordion, Breadcrumbs, Pagination, Tabs } from '@/shared/ui';

import styles from './examples.module.scss';
import { PaginationDemo } from './pagination-demo';

// Tabs, breadcrumbs, pagination and the accordion. The static pagination examples are links back
// to this section; the live one is made of buttons.
const toSection = () => '#navigation';

const productTabs = [
  { value: 'about', label: 'О товаре', panel: <p>Женский вязаный кардиган с пуговицами.</p> },
  { value: 'brand', label: 'О бренде', panel: <p>Sandrine — женская одежда и аксессуары.</p> },
  { value: 'reviews', label: 'Отзывы', count: 54, panel: <p>54 отзыва о товаре.</p> },
  { value: 'questions', label: 'Вопросы', count: 0, panel: <p>Вопросов пока нет.</p> },
];

const accordionItems = [
  { value: 'composition', title: 'Состав и уход', content: <p>Акрил 70%, вискоза 30%.</p> },
  { value: 'delivery', title: 'Доставка', content: <p>Курьером или в пункт выдачи.</p> },
  { value: 'returns', title: 'Возврат', content: <p>В течение 14 дней.</p> },
];

export function NavigationSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус видны вживую. Стрелки, Home и End
        переключают вкладки; Enter или пробел открывают и закрывают строку аккордеона.
      </p>

      <h3 className={styles.heading}>Tabs</h3>
      <ul className={styles.column}>
        <li className={styles.example}>
          <Tabs aria-label="О товаре: size l" items={productTabs} />
          <code className={styles.props}>size=&quot;l&quot;, count</code>
        </li>
        <li className={styles.example}>
          <Tabs
            aria-label="О товаре: size m"
            size="m"
            items={productTabs.map((tab) =>
              tab.value === 'questions' ? { ...tab, disabled: true } : tab,
            )}
            defaultValue="reviews"
          />
          <code className={styles.props}>size=&quot;m&quot;, «Вопросы» disabled</code>
        </li>
        <li className={styles.example}>
          <Tabs aria-label="О товаре: size s" size="s" items={productTabs} />
          <code className={styles.props}>size=&quot;s&quot;</code>
        </li>
      </ul>

      <h3 className={styles.heading}>Breadcrumbs</h3>
      <ul className={styles.column}>
        <li className={styles.example}>
          <Breadcrumbs
            items={[
              { label: 'Главная', href: '#navigation' },
              { label: 'Женщинам', href: '#navigation' },
              { label: 'Одежда', href: '#navigation' },
              { label: 'Джемперы, свитеры и кардиганы', href: '#navigation' },
              { label: 'Кардиганы' },
            ]}
          />
          <code className={styles.props}>последний пункт — текущая страница</code>
        </li>
      </ul>

      <h3 className={styles.heading}>Pagination</h3>
      <ul className={styles.column}>
        <li className={[styles.example, styles.wideBlock].join(' ')}>
          <Pagination page={1} pageCount={2} getHref={toSection} shown={10} total={11} />
          <code className={styles.props}>первая страница, getHref</code>
        </li>
        <li className={[styles.example, styles.wideBlock].join(' ')}>
          <Pagination page={5} pageCount={10} getHref={toSection} shown={10} total={95} />
          <code className={styles.props}>середина: «…» с двух сторон</code>
        </li>
        <li className={[styles.example, styles.wideBlock].join(' ')}>
          <Pagination page={10} pageCount={10} getHref={toSection} shown={5} total={95} />
          <code className={styles.props}>последняя страница</code>
        </li>
      </ul>
      <h4 className={styles.groupTitle}>Кнопки и «Показать ещё», живой пример</h4>
      <div className={styles.wideBlock}>
        <PaginationDemo />
      </div>

      <h3 className={styles.heading}>Accordion</h3>
      <ul className={styles.column}>
        <li className={[styles.example, styles.wideBlock].join(' ')}>
          <Accordion items={accordionItems} />
          <code className={styles.props}>все закрыты</code>
        </li>
        <li className={[styles.example, styles.wideBlock].join(' ')}>
          <Accordion
            items={accordionItems.map((item) =>
              item.value === 'returns' ? { ...item, disabled: true } : item,
            )}
            defaultValue={['composition']}
          />
          <code className={styles.props}>открыт, «Возврат» disabled</code>
        </li>
        <li className={[styles.example, styles.wideBlock].join(' ')}>
          <Accordion items={accordionItems} multiple defaultValue={['composition', 'delivery']} />
          <code className={styles.props}>multiple</code>
        </li>
      </ul>
    </>
  );
}
