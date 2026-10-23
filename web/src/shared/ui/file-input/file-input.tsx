'use client';

import {
  useRef,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { Button, type ButtonSize, type ButtonVariant } from '../button/button';

// The button's own click and pointer handlers (the analytics' tracked element), beside the kit's.
export type FileInputEvents = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'onPointerEnter' | 'onPointerLeave'
>;

export interface FileInputProps {
  // The button's text: "Загрузить фото", "Сделать фото".
  children: ReactNode;
  // The file types the picker offers: `image/jpeg,image/png,image/webp`.
  accept?: string;
  // Opens the camera on a phone (`user` the front one) and the file picker elsewhere (spec 0019
  // A30).
  capture?: 'user' | 'environment';
  // The chosen file. Choosing the same file again calls it again.
  onFileChange: (file: File) => void;
  disabled?: boolean;
  // Shows the button's spinner while the page sends the file; the picker does not open.
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  // A plain <button> the page styles through `className` instead of the kit's Button (board 10's
  // dashed card); `variant`, `size`, `fullWidth` and `loading`'s spinner do not apply.
  bare?: boolean;
  className?: string;
  // The button's name when its content says more than it (a hint inside the card), and the id of
  // that hint.
  'aria-label'?: string;
  'aria-describedby'?: string;
  events?: FileInputEvents;
}

// A kit button that opens the browser's file picker: the native input is hidden and clicked by the
// button, so the control is one button for the keyboard, a screen reader and the analytics, and
// looks like every other button. One file at a time.
export function FileInput({
  children,
  accept,
  capture,
  onFileChange,
  disabled,
  loading,
  variant,
  size,
  fullWidth,
  bare = false,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  events,
}: FileInputProps) {
  const named = { 'aria-label': ariaLabel, 'aria-describedby': ariaDescribedBy };
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Emptied, so the same file chosen again (after a refusal) is a change too.
    event.target.value = '';
    if (file) onFileChange(file);
  }

  const open = (event: MouseEvent<HTMLButtonElement>) => {
    events?.onClick?.(event);
    inputRef.current?.click();
  };

  return (
    <>
      {bare ? (
        <button
          type="button"
          className={className}
          disabled={disabled || loading}
          aria-busy={loading || undefined}
          {...named}
          {...events}
          onClick={open}
        >
          {children}
        </button>
      ) : (
        <Button
          type="button"
          variant={variant}
          size={size}
          fullWidth={fullWidth}
          className={className}
          disabled={disabled}
          loading={loading}
          {...named}
          {...events}
          onClick={open}
        >
          {children}
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        disabled={disabled || loading}
        onChange={handleChange}
        hidden
        tabIndex={-1}
        aria-hidden
      />
    </>
  );
}
