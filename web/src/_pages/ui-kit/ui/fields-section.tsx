import { SearchField, TextField, type TextFieldProps } from '@/shared/ui';

import styles from './examples.module.scss';
import { SearchFieldDemo } from './search-field-demo';

interface Example {
  // The props as the caption under the example shows them.
  props: string;
  field: TextFieldProps;
}

const states: Example[] = [
  { props: 'пустое', field: { label: 'Имя' } },
  { props: 'заполненное', field: { label: 'Имя', defaultValue: 'Анна' } },
  {
    props: 'hint',
    field: {
      label: 'Электронная почта',
      type: 'email',
      hint: 'Пришлём на неё чек и статус заказа',
    },
  },
  {
    props: 'error',
    field: {
      label: 'Телефон',
      type: 'tel',
      defaultValue: '+7 999',
      error: 'Неверный формат номера',
    },
  },
  { props: 'disabled', field: { label: 'Фамилия', disabled: true } },
  {
    props: 'disabled · заполненное',
    field: { label: 'Фамилия', defaultValue: 'Иванова', disabled: true },
  },
];

// TextField in every state and the search field, empty, filled and live.
export function FieldsSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус видны вживую. Подпись поднимается, когда
        поле в фокусе или заполнено.
      </p>

      <h3 className={styles.heading}>TextField</h3>
      <ul className={styles.row}>
        {states.map(({ props, field }) => (
          <li key={props} className={`${styles.example} ${styles.field}`}>
            <TextField {...field} />
            <code className={styles.props}>{props}</code>
          </li>
        ))}
      </ul>

      <h3 className={styles.heading}>SearchField</h3>
      <ul className={styles.row}>
        <li className={`${styles.example} ${styles.field}`}>
          <SearchField />
          <code className={styles.props}>пустое</code>
        </li>
        <li className={`${styles.example} ${styles.field}`}>
          <SearchField defaultValue="Кроссовки" />
          <code className={styles.props}>заполненное: кнопка «Очистить»</code>
        </li>
        <li className={`${styles.example} ${styles.field}`}>
          <SearchField defaultValue="Кроссовки" disabled />
          <code className={styles.props}>disabled</code>
        </li>
      </ul>

      <h4 className={styles.groupTitle}>Живой пример</h4>
      <SearchFieldDemo />
    </>
  );
}
