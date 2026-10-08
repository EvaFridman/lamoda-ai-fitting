import styles from './examples.module.scss';
import { FilterChipStates, OpenFilterState } from './filter-states';
import { FiltersDemo } from './filters-demo';

// Filter chips with their dropdowns (checkbox list, sort) in every state, and a live row of them.
export function FiltersSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус видны вживую. Enter или пробел открывает
        список, Esc закрывает его и возвращает фокус на чип.
      </p>

      <h3 className={styles.heading}>FilterChip</h3>
      <FilterChipStates />

      <h3 className={styles.heading}>FilterDropdown с CheckboxFilter, открыт</h3>
      <OpenFilterState />

      <h3 className={styles.heading}>FilterChips, живой пример</h3>
      <FiltersDemo />
    </>
  );
}
