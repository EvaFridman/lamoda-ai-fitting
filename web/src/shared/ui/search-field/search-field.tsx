'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { Input } from '@base-ui/react/input';
import { type FormEvent, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

import { CloseIcon, SearchIcon } from '../icon/icons';

import styles from './search-field.module.scss';

export interface SearchFieldProps extends Omit<
  Input.Props,
  'className' | 'style' | 'render' | 'type' | 'value' | 'defaultValue' | 'onValueChange'
> {
  // The input's accessible name: the field has no visible label.
  label?: string;
  // Makes the field controlled. React then writes the value into the input's `value` attribute,
  // which recordings and the SDK's click events keep (L9): pass it only for text that may go there.
  value?: string;
  // The uncontrolled field's starting text, set as the DOM value, never as an attribute.
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  // Called with the trimmed value on Enter or the search button; not called for an empty value.
  onSearch?: (value: string) => void;
  className?: string;
}

// Lamoda's header search: a grey field, white with a shadow on hover and focus, with a reset button
// while it is filled and a black square search button (D7d). Controlled through `value` or
// uncontrolled with `defaultValue`; uncontrolled, the text lives only in the DOM value, so no
// attribute carries what is typed (L9).
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
  const controlled = valueProp !== undefined;
  // Uncontrolled, only whether the field is filled is state (for the reset button); the text is
  // read from and written to `input.value`. Base UI does not see those writes, so the input's
  // `data-filled`/`data-dirty` may be stale: style through `filled` (`withReset`), not them.
  const [ownFilled, setOwnFilled] = useState(false);
  const filled = controlled ? valueProp !== '' : ownFilled;
  // The reset button focuses the input through this ref; `ref` hands the same input out.
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  // On mount only, like `defaultValue`: a new starting text needs a new `key`. Text typed before
  // hydration, or restored by the browser, wins over the starting text.
  const startValueRef = useRef(controlled ? null : defaultValue);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || startValueRef.current === null) return;
    if (input.value === '') input.value = startValueRef.current;
    setOwnFilled(input.value !== '');
  }, []);

  function changeValue(next: string) {
    if (!controlled) setOwnFilled(next !== '');
    onValueChange?.(next);
  }

  function reset() {
    if (!controlled && inputRef.current) inputRef.current.value = '';
    changeValue('');
    inputRef.current?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = (controlled ? valueProp : (inputRef.current?.value ?? '')).trim();
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
        className={[styles.input, filled && !disabled && styles.withReset]
          .filter(Boolean)
          .join(' ')}
        aria-label={label}
        placeholder={placeholder}
        disabled={disabled}
        {...(controlled ? { value: valueProp } : {})}
        onValueChange={changeValue}
        {...input}
      />
      {filled && !disabled ? (
        <BaseButton type="button" className={styles.reset} aria-label="Очистить" onClick={reset}>
          <CloseIcon />
        </BaseButton>
      ) : null}
      <BaseButton type="submit" className={styles.submit} aria-label="Найти" disabled={disabled}>
        <SearchIcon />
      </BaseButton>
    </form>
  );
}
