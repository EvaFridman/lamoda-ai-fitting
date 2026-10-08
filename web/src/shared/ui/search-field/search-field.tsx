'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { Input } from '@base-ui/react/input';
import { type FormEvent, useImperativeHandle, useRef, useState } from 'react';

import { CloseIcon, SearchIcon } from '../icon/icons';

import styles from './search-field.module.scss';

export interface SearchFieldProps extends Omit<
  Input.Props,
  'className' | 'style' | 'render' | 'type' | 'value' | 'defaultValue' | 'onValueChange'
> {
  // The input's accessible name: the field has no visible label.
  label?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  // Called with the trimmed value on Enter or the search button; not called for an empty value.
  onSearch?: (value: string) => void;
  className?: string;
}

// Lamoda's header search: a grey field, white with a shadow on hover and focus, with a reset button
// while it is filled and a black square search button (D7d). Controlled through `value` or
// uncontrolled with `defaultValue`.
export function SearchField({
  label = 'Поиск',
  value: valueProp,
  defaultValue = '',
  onValueChange,
  onSearch,
  placeholder = 'Товар, бренд или артикул',
  disabled = false,
  className,
  ref,
  ...input
}: SearchFieldProps) {
  const [ownValue, setOwnValue] = useState(defaultValue);
  const value = valueProp ?? ownValue;
  // The reset button focuses the input through this ref; `ref` hands the same input out.
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  function changeValue(next: string) {
    if (valueProp === undefined) setOwnValue(next);
    onValueChange?.(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = value.trim();
    if (query && !disabled) onSearch?.(query);
  }

  return (
    <form
      role="search"
      className={[styles.searchField, disabled && styles.disabled, className]
        .filter(Boolean)
        .join(' ')}
      onSubmit={submit}
    >
      <Input
        ref={inputRef}
        type="search"
        className={[styles.input, value && !disabled && styles.withReset].filter(Boolean).join(' ')}
        aria-label={label}
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onValueChange={changeValue}
        {...input}
      />
      {value && !disabled ? (
        <BaseButton
          type="button"
          className={styles.reset}
          aria-label="Очистить"
          onClick={() => {
            changeValue('');
            inputRef.current?.focus();
          }}
        >
          <CloseIcon />
        </BaseButton>
      ) : null}
      <BaseButton type="submit" className={styles.submit} aria-label="Найти" disabled={disabled}>
        <SearchIcon />
      </BaseButton>
    </form>
  );
}
