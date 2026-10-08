import { Checkbox, Radio, RadioGroup, Switch } from '@/shared/ui';

import { CheckboxGroupDemo } from './checkbox-group-demo';
import styles from './examples.module.scss';
import { RadioGroupDemo } from './radio-group-demo';

interface Example {
  // The props as the caption under the example shows them.
  props: string;
  checked: boolean;
  disabled?: boolean;
}

const states: Example[] = [
  { props: 'по умолчанию', checked: false },
  { props: 'checked', checked: true },
  { props: 'disabled', checked: false, disabled: true },
  { props: 'disabled · checked', checked: true, disabled: true },
];

// Checkbox, Radio and Switch in every state (no error state, D7e), and their groups live. Each
// static example can still be clicked.
export function ChoiceSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус видны вживую. Пробел переключает, стрелки
        двигают выбор внутри группы радиокнопок.
      </p>

      <h3 className={styles.heading}>Checkbox</h3>
      <ul className={styles.row}>
        {states.map(({ props, checked, disabled }) => (
          <li key={props} className={styles.example}>
            <Checkbox defaultChecked={checked} disabled={disabled}>
              Хлопок
            </Checkbox>
            <code className={styles.props}>{props}</code>
          </li>
        ))}
      </ul>

      <h4 className={styles.groupTitle}>CheckboxGroup, живой пример</h4>
      <CheckboxGroupDemo />

      <h3 className={styles.heading}>Radio</h3>
      <ul className={styles.row}>
        {states.map(({ props, checked, disabled }) => (
          <li key={props} className={styles.example}>
            <RadioGroup
              aria-label={`Радиокнопка: ${props}`}
              defaultValue={checked ? 'new' : undefined}
            >
              <Radio value="new" disabled={disabled}>
                Новинки
              </Radio>
            </RadioGroup>
            <code className={styles.props}>{props}</code>
          </li>
        ))}
      </ul>

      <h4 className={styles.groupTitle}>RadioGroup, живой пример</h4>
      <RadioGroupDemo />

      <h3 className={styles.heading}>Switch</h3>
      <ul className={styles.row}>
        {states.map(({ props, checked, disabled }) => (
          <li key={props} className={styles.example}>
            <Switch defaultChecked={checked} disabled={disabled}>
              Только со скидкой
            </Switch>
            <code className={styles.props}>{props}</code>
          </li>
        ))}
      </ul>
    </>
  );
}
