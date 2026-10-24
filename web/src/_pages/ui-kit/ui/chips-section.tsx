import { Chip, ChipGroup } from '@/shared/ui';

import { ChipsDemo } from './chips-demo';
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
      <ul className={styles.row}>
        <li className={styles.example}>
          <ChipGroup aria-label="Обычный" value={[]} onValueChange={() => {}}>
            <Chip value="face">Лицо</Chip>
          </ChipGroup>
          <code className={styles.props}>обычный</code>
        </li>
        <li className={styles.example}>
          <ChipGroup aria-label="Нажатый" value={['item']} onValueChange={() => {}}>
            <Chip value="item">Вещь</Chip>
          </ChipGroup>
          <code className={styles.props}>нажатый</code>
        </li>
        <li className={styles.example}>
          <ChipGroup aria-label="Недоступный" value={[]} onValueChange={() => {}} disabled>
            <Chip value="background">Фон</Chip>
          </ChipGroup>
          <code className={styles.props}>disabled</code>
        </li>
      </ul>
    </>
  );
}
