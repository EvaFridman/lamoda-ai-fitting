import { ColorSwatch, type SwatchColor, SizePicker, SizeSelector } from '@/shared/ui';

import { ColorSwatchDemo } from './color-swatch-demo';
import styles from './examples.module.scss';
import { SizePickerDemo } from './size-picker-demo';
import { SizeSelectorDemo } from './size-selector-demo';

interface SizeExample {
  // The props as the caption under the example shows them.
  props: string;
  checked: boolean;
  disabled?: boolean;
  soldOut?: boolean;
}

const pickerStates: SizeExample[] = [
  { props: 'по умолчанию', checked: false },
  { props: 'checked', checked: true },
  { props: 'disabled', checked: false, disabled: true },
  { props: 'disabled · checked', checked: true, disabled: true },
];

const selectorStates: SizeExample[] = [
  { props: 'по умолчанию', checked: false },
  { props: 'checked', checked: true },
  { props: 'soldOut', checked: false, soldOut: true },
  { props: 'disabled', checked: false, disabled: true },
];

interface SwatchExample {
  props: string;
  color: SwatchColor;
  label: string;
  checked: boolean;
  disabled?: boolean;
}

const swatchStates: SwatchExample[] = [
  { props: 'по умолчанию', color: 'black', label: 'Черный', checked: false },
  { props: 'checked', color: 'black', label: 'Черный', checked: true },
  { props: 'checked · светлый цвет', color: 'white', label: 'Белый', checked: true },
  { props: 'disabled', color: 'red', label: 'Красный', checked: false, disabled: true },
];

// The size filter, the size selector of a product and the colour filter in every state, and each
// live. Each static example can still be clicked.
export function SizesColorsSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус видны вживую. Пробел выбирает; в
        SizeSelector стрелки двигают выбор и пропускают размеры, которых нет в наличии.
      </p>

      <h3 className={styles.heading}>SizePicker</h3>
      <ul className={styles.row}>
        {pickerStates.map(({ props, checked, disabled }) => (
          <li key={props} className={styles.example}>
            <SizePicker
              aria-label={`Размер: ${props}`}
              options={[{ value: '44', label: '44', disabled }]}
              defaultValue={checked ? ['44'] : []}
            />
            <code className={styles.props}>{props}</code>
          </li>
        ))}
      </ul>

      <h4 className={styles.groupTitle}>SizePicker, живой пример</h4>
      <SizePickerDemo />

      <h3 className={styles.heading}>SizeSelector</h3>
      <ul className={styles.row}>
        {selectorStates.map(({ props, checked, disabled, soldOut }) => (
          <li key={props} className={styles.example}>
            <SizeSelector
              aria-label={`Размер товара: ${props}`}
              options={[{ value: '44', label: '44', soldOut }]}
              defaultValue={checked ? '44' : undefined}
              disabled={disabled}
            />
            <code className={styles.props}>{props}</code>
          </li>
        ))}
      </ul>

      <h4 className={styles.groupTitle}>SizeSelector, живой пример</h4>
      <SizeSelectorDemo />

      <h3 className={styles.heading}>ColorSwatch</h3>
      <ul className={styles.row}>
        {swatchStates.map(({ props, color, label, checked, disabled }) => (
          <li key={props} className={styles.example}>
            <ColorSwatch color={color} defaultChecked={checked} disabled={disabled}>
              {label}
            </ColorSwatch>
            <code className={styles.props}>{props}</code>
          </li>
        ))}
      </ul>

      <h4 className={styles.groupTitle}>ColorSwatch в CheckboxGroup, живой пример</h4>
      <ColorSwatchDemo />
    </>
  );
}
