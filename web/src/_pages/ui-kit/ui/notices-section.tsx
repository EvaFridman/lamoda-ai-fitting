import { Button, Notice, RefreshIcon, StateCard, UploadIcon } from '@/shared/ui';

import styles from './examples.module.scss';

// Messages inside the page (Notice) and a block's state in place of its content (StateCard).
export function NoticesSection() {
  return (
    <>
      <p className={styles.caption}>
        Notice стоит в потоке страницы, а не поверх неё, как уведомление. Появившемуся после
        загрузки страницы нужен role=&quot;status&quot; или &quot;alert&quot;.
      </p>

      <h3 className={styles.heading}>Notice</h3>
      <ul className={styles.column}>
        <li className={styles.example}>
          <Notice title="Как сделать хорошее фото">
            Встаньте в полный рост при хорошем освещении, одни в кадре.
          </Notice>
          <code className={styles.props}>tone=&quot;info&quot; title</code>
        </li>
        <li className={styles.example}>
          <Notice tone="success">Фото сохранено</Notice>
          <code className={styles.props}>tone=&quot;success&quot;</code>
        </li>
        <li className={styles.example}>
          <Notice tone="warning">Можно сохранить ещё одно фото</Notice>
          <code className={styles.props}>tone=&quot;warning&quot;</code>
        </li>
        <li className={styles.example}>
          <Notice tone="error" title="Фото не подходит для примерки">
            На фото несколько человек. Загрузите фото, где вы одни.
          </Notice>
          <code className={styles.props}>tone=&quot;error&quot; title</code>
        </li>
      </ul>

      <h3 className={styles.heading}>StateCard</h3>
      <ul className={styles.column}>
        <li className={styles.example}>
          <StateCard
            titleAs="h4"
            icon={<UploadIcon />}
            title="Здесь появятся ваши фото"
            actions={<Button>Загрузить фото</Button>}
          >
            Загрузите фото в полный рост, чтобы примерять вещи.
          </StateCard>
          <code className={styles.props}>icon, title, children, actions</code>
        </li>
        <li className={styles.example}>
          <StateCard
            titleAs="h4"
            icon={<RefreshIcon />}
            title="Не удалось загрузить"
            actions={<Button variant="outline">Повторить</Button>}
          />
          <code className={styles.props}>без текста</code>
        </li>
      </ul>
    </>
  );
}
