import { ScrollRow } from '@/shared/ui';

import styles from './examples.module.scss';

const tiles = (count: number) =>
  Array.from({ length: count }, (_, index) => (
    <li key={index} className={styles.scrollTile}>
      {index + 1}
    </li>
  ));

// One row that scrolls sideways (spec 0019 A87.3, «С этим товаром выбирают»): eight items, four
// in view, and three, which fit and get no arrows.
export function ScrollRowSection() {
  return (
    <>
      <p className={styles.caption}>
        Ряд листается вбок с привязкой к элементам. От 600px по бокам стрелки «‹» и «›»: на концах
        ряда отключены, а когда всё помещается, их нет. Уже 600px — только свайп. Сколько элементов
        видно, задаёт страница.
      </p>

      <h3 className={styles.heading}>ScrollRow</h3>
      <h4 className={styles.groupTitle}>Восемь элементов, видно четыре</h4>
      <ScrollRow aria-label="Ряд, пример 1" className={styles.scrollRow}>
        {tiles(8)}
      </ScrollRow>
      <h4 className={styles.groupTitle}>Три элемента: помещаются, стрелок нет</h4>
      <ScrollRow aria-label="Ряд, пример 2" className={styles.scrollRow}>
        {tiles(3)}
      </ScrollRow>
    </>
  );
}
