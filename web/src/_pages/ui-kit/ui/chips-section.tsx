import { ChipsDemo, ChipStates } from './chips-demo';
import styles from './examples.module.scss';

// Chips: the reasons of a regeneration (board 7) and the item to change in a look (board 8).
export function ChipsSection() {
  return (
    <>
      <p className={styles.caption}>
        Нажатый чип становится чёрным; повторное нажатие его отпускает. Tab переходит к группе,
        стрелки — между чипами, Enter и Space нажимают.
      </p>

      <h3 className={styles.heading}>Chip и ChipGroup</h3>
      <ChipsDemo />

      <h4 className={styles.groupTitle}>Состояния</h4>
      <ChipStates />
    </>
  );
}
