'use client';

import { Button, showToast } from '@/shared/ui';

import styles from './examples.module.scss';

// Buttons that show the three kinds of toast; the toasts appear at the bottom of the screen.
export function ToastDemo() {
  return (
    <ul className={styles.row}>
      <li className={styles.example}>
        <Button variant="outline" onClick={() => showToast({ title: 'Товар добавлен в корзину' })}>
          Показать уведомление
        </Button>
        <code className={styles.props}>title</code>
      </li>
      <li className={styles.example}>
        <Button
          variant="outline"
          onClick={() =>
            showToast({
              title: 'Товар удалён из избранного',
              actionLabel: 'Вернуть',
              onAction: () => showToast({ title: 'Товар снова в избранном' }),
            })
          }
        >
          С действием
        </Button>
        <code className={styles.props}>actionLabel, onAction</code>
      </li>
      <li className={styles.example}>
        <Button
          variant="outline"
          onClick={() =>
            showToast({ title: 'Не удалось добавить товар. Попробуйте ещё раз', tone: 'error' })
          }
        >
          Ошибка
        </Button>
        <code className={styles.props}>tone=&quot;error&quot;</code>
      </li>
    </ul>
  );
}
