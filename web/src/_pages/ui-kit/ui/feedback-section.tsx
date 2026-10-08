import { Skeleton } from '@/shared/ui';

import styles from './examples.module.scss';
import { ToastDemo } from './toast-demo';

// Toasts and skeletons. Toasts are shown live only (D7z): showToast puts them at the bottom of the
// screen, where the app's ToastProvider renders them.
export function FeedbackSection() {
  return (
    <>
      <p className={styles.caption}>
        Нажмите кнопку: уведомление появится внизу экрана и пропадёт через 5 секунд. Пока на нём
        курсор или фокус, оно не пропадает. При «уменьшении движения» в системе уведомления не
        выезжают, а скелетоны не пульсируют.
      </p>

      <h3 className={styles.heading}>Toast</h3>
      <ToastDemo />

      <h3 className={styles.heading}>Skeleton</h3>
      <ul className={styles.row}>
        <li className={styles.example}>
          <div className={styles.skeletonCard}>
            <Skeleton height={330} />
            <Skeleton width="60%" height={20} />
            <Skeleton width="40%" height={16} />
          </div>
          <code className={styles.props}>карточка товара: width, height</code>
        </li>
        <li className={styles.example}>
          <Skeleton width={48} height={48} radius="50%" />
          <code className={styles.props}>radius=&quot;50%&quot;</code>
        </li>
        <li className={styles.example}>
          <Skeleton width={120} height={48} radius={4} />
          <code className={styles.props}>radius={'{4}'}</code>
        </li>
      </ul>
    </>
  );
}
