'use client';

import { Select as BaseSelect } from '@base-ui/react/select';
import Image from 'next/image';

import { ChevronDownIcon } from '../icon/icons';

import styles from './select.module.scss';

export interface SelectOption {
  value: string;
  // The option's text, in the list and in the field once picked.
  label: string;
  // A 23×32 picture before the text: the product in this colour. Decorative, the label names it.
  thumbnail?: string;
  disabled?: boolean;
}

// A select needs a name for screen readers: a visible heading's id or a text of its own.
type SelectName = { 'aria-labelledby': string } | { 'aria-label': string };

export type SelectProps = Pick<
  BaseSelect.Root.Props<string>,
  | 'value'
  | 'defaultValue'
  | 'onValueChange'
  | 'open'
  | 'defaultOpen'
  | 'onOpenChange'
  | 'disabled'
  | 'name'
  | 'required'
> &
  SelectName & {
    options: SelectOption[];
    // Grey text in the field while nothing is picked ("Выберите размер").
    placeholder?: string;
    className?: string;
  };

// Lamoda's product select (colour and size on the product page): a bordered field with the value
// and a chevron, and under it a list as wide as the field. Base UI renders the field as a button
// with role="combobox" and the list as role="listbox": Enter, Space or a click open it, the arrows
// move, Enter picks, Esc closes, and the focus goes back to the field. The page keeps scrolling
// while it is open, and the list opens under the field, not over it (D7p).
export function Select({
  options,
  placeholder,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...root
}: SelectProps & { 'aria-label'?: string; 'aria-labelledby'?: string }) {
  const withThumbnails = options.some((option) => option.thumbnail);
  const byValue = new Map(options.map((option) => [option.value, option]));

  return (
    <BaseSelect.Root<string> modal={false} {...root}>
      <BaseSelect.Trigger
        className={[styles.trigger, className].filter(Boolean).join(' ')}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        data-thumbnails={withThumbnails || undefined}
      >
        <BaseSelect.Value className={styles.value}>
          {(value: string | null) => {
            const option = value === null ? undefined : byValue.get(value);
            if (!option) return <span className={styles.placeholder}>{placeholder}</span>;
            return <OptionContent option={option} />;
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon className={styles.icon}>
          <ChevronDownIcon />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className={styles.positioner}
          alignItemWithTrigger={false}
          align="start"
        >
          <BaseSelect.Popup className={styles.popup}>
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  disabled={option.disabled}
                  className={styles.item}
                >
                  <OptionContent option={option} text={BaseSelect.ItemText} />
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

// The thumbnail, if any, and the label; in the list the label is Base UI's ItemText.
function OptionContent({
  option,
  text: Text = 'span',
}: {
  option: SelectOption;
  text?: typeof BaseSelect.ItemText | 'span';
}) {
  return (
    <>
      {option.thumbnail ? (
        <Image className={styles.thumbnail} src={option.thumbnail} alt="" width={23} height={32} />
      ) : null}
      <Text className={styles.label}>{option.label}</Text>
    </>
  );
}
