import {
  Button,
  type ButtonAsButtonProps,
  HeartIcon,
  IconButton,
  SparkleIcon,
  TrashIcon,
} from '@/shared/ui';

import styles from './examples.module.scss';
import { LoadingButtonDemo } from './loading-button-demo';
import { TrackedButton, type UiKitElement } from './tracked-button';

interface Example {
  // The props as the caption under the example shows them.
  props: string;
  button: Omit<ButtonAsButtonProps, 'children'>;
  label: string;
  // Sends click and hover events to analytics (spec 0008).
  tracked?: UiKitElement;
}

const variants: Example[] = [
  {
    props: 'primary',
    button: { variant: 'primary' },
    label: 'Добавить в корзину',
    tracked: 'ui-kit.button-primary',
  },
  { props: 'secondary', button: { variant: 'secondary' }, label: 'Применить' },
  { props: 'outline', button: { variant: 'outline' }, label: 'Оценить доставку' },
];

const sizes: Example[] = [
  { props: 'size 56', button: { size: 56 }, label: 'В корзину' },
  { props: 'size 48', button: { size: 48 }, label: 'В корзину' },
  { props: 'size 40', button: { size: 40 }, label: 'В корзину' },
  { props: 'size 32', button: { size: 32 }, label: 'В корзину' },
  {
    props: 'size 32 · textSize body-s',
    button: { size: 32, textSize: 'body-s' },
    label: 'В корзину',
  },
];

const states: Example[] = [
  { props: 'primary · disabled', button: { disabled: true }, label: 'Нет в наличии' },
  {
    props: 'secondary · disabled',
    button: { variant: 'secondary', disabled: true },
    label: 'Применить',
  },
  {
    props: 'outline · disabled',
    button: { variant: 'outline', disabled: true },
    label: 'Оценить доставку',
  },
  { props: 'primary · loading', button: { loading: true }, label: 'Добавить в корзину' },
  {
    props: 'secondary · loading',
    button: { variant: 'secondary', loading: true },
    label: 'Применить',
  },
  {
    props: 'outline · loading',
    button: { variant: 'outline', loading: true },
    label: 'Оценить доставку',
  },
];

// «Примерить» of the product page's buy box (spec 0019 A63.2, board 13's TryOnButton): primary 56
// with the sparkle icon, never over the photo; disabled once the month's try-ons are spent.
const tryOn: { props: string; button: Omit<ButtonAsButtonProps, 'children'> }[] = [
  { props: 'TryOnButton · default', button: {} },
  { props: 'TryOnButton · loading', button: { loading: true } },
  { props: 'TryOnButton · disabled (лимит)', button: { disabled: true } },
];

function ExampleRow({ examples }: { examples: Example[] }) {
  return (
    <ul className={styles.row}>
      {examples.map(({ props, button, label, tracked }) => (
        <li key={props} className={styles.example}>
          {tracked ? (
            <TrackedButton {...button} element={tracked}>
              {label}
            </TrackedButton>
          ) : (
            <Button {...button}>{label}</Button>
          )}
          <code className={styles.props}>{props}</code>
        </li>
      ))}
    </ul>
  );
}

// Button in every variant, size and state, IconButton, and the pair from the product page.
export function ButtonsSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус видны вживую. Enter и Space нажимают
        кнопку.
      </p>

      <h3 className={styles.heading}>Button</h3>
      <h4 className={styles.groupTitle}>Варианты</h4>
      <ExampleRow examples={variants} />
      <h4 className={styles.groupTitle}>Размеры</h4>
      <ExampleRow examples={sizes} />
      <h4 className={styles.groupTitle}>Состояния</h4>
      <ExampleRow examples={states} />

      <h4 className={styles.groupTitle}>Примерить</h4>
      <ul className={styles.row}>
        {tryOn.map(({ props, button }) => (
          <li key={props} className={styles.example}>
            <Button size={56} {...button}>
              <SparkleIcon />
              Примерить
            </Button>
            <code className={styles.props}>{props}</code>
          </li>
        ))}
      </ul>

      <h4 className={styles.groupTitle}>Во всю ширину и ссылкой</h4>
      <ul className={styles.row}>
        <li className={`${styles.example} ${styles.wide}`}>
          <Button variant="outline" fullWidth>
            Показать ещё
          </Button>
          <code className={styles.props}>outline · fullWidth</code>
        </li>
        <li className={styles.example}>
          <Button href="#buttons" size={32} textSize="body-s">
            Оценить товары · 1
          </Button>
          <code className={styles.props}>href: ссылка в виде кнопки</code>
        </li>
      </ul>

      <h4 className={styles.groupTitle}>Живой пример</h4>
      <ul className={styles.row}>
        <li className={styles.example}>
          <LoadingButtonDemo />
          <code className={styles.props}>нажмите: loading на 2 секунды</code>
        </li>
      </ul>

      <h3 className={styles.heading}>IconButton</h3>
      <ul className={styles.row}>
        <li className={styles.example}>
          <IconButton aria-label="Добавить в избранное">
            <HeartIcon />
          </IconButton>
          <code className={styles.props}>size 48</code>
        </li>
        <li className={styles.example}>
          <IconButton size={56} aria-label="Добавить в избранное">
            <HeartIcon />
          </IconButton>
          <code className={styles.props}>size 56</code>
        </li>
        <li className={styles.example}>
          <IconButton disabled aria-label="Добавить в избранное">
            <HeartIcon />
          </IconButton>
          <code className={styles.props}>disabled</code>
        </li>
        <li className={styles.example}>
          <IconButton variant="plain" size={44} aria-label="Удалить фото 1">
            <TrashIcon />
          </IconButton>
          <code className={styles.props}>variant=&quot;plain&quot; size 44</code>
        </li>
      </ul>

      <h4 className={styles.groupTitle}>Как на странице товара</h4>
      <div className={styles.pair}>
        <Button fullWidth>Добавить в корзину</Button>
        <IconButton aria-label="Добавить в избранное">
          <HeartIcon />
        </IconButton>
      </div>
    </>
  );
}
