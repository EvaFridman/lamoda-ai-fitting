import { Select } from '@/shared/ui';

import { colorOptions, sizeOptions } from '../config/select';
import styles from './examples.module.scss';
import { SelectDemo } from './select-demo';

// Lamoda's product select: empty, with a thumbnail and disabled with its only size; then both
// selects of a product page live. The open state is shown live only: a select open from the start
// would take the focus as the page loads (D7q). Each static example can still be opened.
export function SelectSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус видны вживую. Открытый список тоже
        показывается вживую: Enter, пробел или клик открывают любой пример, стрелки двигают
        выделение, Enter выбирает, Esc закрывает.
      </p>

      <h3 className={styles.heading}>Select</h3>
      <ul className={styles.row}>
        <li className={[styles.example, styles.select].join(' ')}>
          <Select
            aria-label="Размер: по умолчанию"
            options={sizeOptions}
            placeholder="Выберите размер"
          />
          <code className={styles.props}>placeholder</code>
        </li>
        <li className={[styles.example, styles.select].join(' ')}>
          <Select aria-label="Цвет: с миниатюрой" options={colorOptions} defaultValue="white" />
          <code className={styles.props}>thumbnail</code>
        </li>
        <li className={[styles.example, styles.select].join(' ')}>
          <Select
            aria-label="Размер: disabled"
            options={[{ value: '40-44', label: '40/44 RUS (40/44 RUS)' }]}
            defaultValue="40-44"
            disabled
          />
          <code className={styles.props}>disabled</code>
        </li>
      </ul>

      <h4 className={styles.groupTitle}>Цвет и размер товара, живой пример</h4>
      <SelectDemo />
    </>
  );
}
