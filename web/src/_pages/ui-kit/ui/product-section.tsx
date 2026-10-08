import { Badges, FavoriteToggle, OrderStatus, Price, Rating } from '@/shared/ui';

import styles from './examples.module.scss';

// Product and order pieces: prices, badges, rating, the favourite toggle and the order status.
// Every price layout, badge tone and status tone is a static example; the favourite toggles are
// live (click them).
export function ProductSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус «Избранного» видны вживую. Клик или пробел
        переключают сердечко.
      </p>

      <h3 className={styles.heading}>Price</h3>
      <h4 className={styles.groupTitle}>Каталог</h4>
      <ul className={styles.row}>
        <li className={styles.example}>
          <Price price={4500} />
          <code className={styles.props}>price</code>
        </li>
        <li className={styles.example}>
          <Price price={2992} oldPrices={[4199]} />
          <code className={styles.props}>oldPrices: одна</code>
        </li>
        <li className={styles.example}>
          <Price price={7746} oldPrices={[13999, 9799]} />
          <code className={styles.props}>oldPrices: две</code>
        </li>
        <li className={styles.example}>
          <Price price={1299.5} />
          <code className={styles.props}>с копейками</code>
        </li>
      </ul>
      <h4 className={styles.groupTitle}>Карточка товара</h4>
      <ul className={styles.row}>
        <li className={styles.example}>
          <Price price={4521} variant="product" />
          <code className={styles.props}>variant=&quot;product&quot;</code>
        </li>
        <li className={styles.example}>
          <Price price={4521} oldPrices={[10399]} variant="product" />
          <code className={styles.props}>oldPrices: одна</code>
        </li>
        <li className={styles.example}>
          <Price price={7746} oldPrices={[13999, 9799]} variant="product" />
          <code className={styles.props}>oldPrices: две</code>
        </li>
      </ul>

      <h3 className={styles.heading}>Badges</h3>
      <ul className={styles.row}>
        <li className={styles.example}>
          <Badges badges={[{ tone: 'discount', label: '−40%' }]} />
          <code className={styles.props}>discount</code>
        </li>
        <li className={styles.example}>
          <Badges badges={[{ tone: 'club', label: '−7% club' }]} />
          <code className={styles.props}>club</code>
        </li>
        <li className={styles.example}>
          <Badges badges={[{ tone: 'premium', label: 'premium' }]} />
          <code className={styles.props}>premium</code>
        </li>
        <li className={styles.example}>
          <Badges badges={[{ tone: 'promo', label: 'до 25%' }]} />
          <code className={styles.props}>promo</code>
        </li>
        <li className={styles.example}>
          <Badges
            badges={[
              { tone: 'discount', label: '−40%' },
              { tone: 'club', label: '−7% club' },
            ]}
          />
          <code className={styles.props}>два в ряд</code>
        </li>
        <li className={styles.example}>
          <Badges
            badges={[
              { tone: 'premium', label: 'premium' },
              { tone: 'club', label: '−5% club' },
            ]}
          />
          <code className={styles.props}>premium и club</code>
        </li>
        <li className={styles.example}>
          <Badges size="l" badges={[{ tone: 'discount', label: '−56%' }]} />
          <code className={styles.props}>size=&quot;l&quot;</code>
        </li>
      </ul>

      <h3 className={styles.heading}>Rating</h3>
      <ul className={styles.row}>
        <li className={styles.example}>
          <Rating value={4.7} />
          <code className={styles.props}>value=4.7</code>
        </li>
        <li className={styles.example}>
          <Rating value={5} />
          <code className={styles.props}>value=5</code>
        </li>
      </ul>

      <h3 className={styles.heading}>FavoriteToggle</h3>
      <ul className={styles.row}>
        <li className={styles.example}>
          <FavoriteToggle />
          <code className={styles.props}>size=24</code>
        </li>
        <li className={styles.example}>
          <FavoriteToggle defaultPressed />
          <code className={styles.props}>pressed</code>
        </li>
        <li className={styles.example}>
          <span className={styles.photo}>
            <FavoriteToggle size={32} />
          </span>
          <code className={styles.props}>size=32, на фото</code>
        </li>
        <li className={styles.example}>
          <span className={styles.photo}>
            <FavoriteToggle size={32} defaultPressed />
          </span>
          <code className={styles.props}>size=32, pressed</code>
        </li>
        <li className={styles.example}>
          <FavoriteToggle size={48} />
          <code className={styles.props}>size=48</code>
        </li>
        <li className={styles.example}>
          <FavoriteToggle size={56} />
          <code className={styles.props}>size=56</code>
        </li>
        <li className={styles.example}>
          <FavoriteToggle size={56} defaultPressed />
          <code className={styles.props}>size=56, pressed</code>
        </li>
        <li className={styles.example}>
          <FavoriteToggle size={56} disabled />
          <code className={styles.props}>disabled</code>
        </li>
      </ul>

      <h3 className={styles.heading}>OrderStatus</h3>
      <ul className={styles.column}>
        <li className={styles.example}>
          <OrderStatus title="Доставлен" date="5 октября" />
          <code className={styles.props}>primary</code>
        </li>
        <li className={styles.example}>
          <OrderStatus title="Готов к выдаче" date="7 октября" tone="success" />
          <code className={styles.props}>success</code>
        </li>
        <li className={styles.example}>
          <OrderStatus title="Не выкуплен" date="29 июля 2024 года" tone="warning" />
          <code className={styles.props}>warning</code>
        </li>
        <li className={styles.example}>
          <OrderStatus title="Ожидает оплаты" date="8 октября" tone="caution" />
          <code className={styles.props}>caution</code>
        </li>
        <li className={styles.example}>
          <OrderStatus title="Оформлен" date="8 октября" tone="secondary" />
          <code className={styles.props}>secondary</code>
        </li>
      </ul>
    </>
  );
}
