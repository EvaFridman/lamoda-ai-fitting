'use client';

import { Field } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';

import styles from './text-field.module.scss';

export interface TextFieldProps extends Omit<Input.Props, 'className' | 'style' | 'render'> {
  label: string;
  // A grey line under the field. An error replaces it (D7c).
  hint?: string;
  // Marks the field invalid (aria-invalid) and shows the text in red under it.
  error?: string;
  className?: string;
}

// Lamoda's "material" field: 56px high with a bottom border and a floating label, inside the empty
// field and small above the value once it is focused or filled (D7c). Base UI's Field ties the
// label, the hint and the error to the input (label, aria-describedby, aria-invalid) and sets the
// data-filled and data-focused the label floats on.
export function TextField({ label, hint, error, disabled, className, ...input }: TextFieldProps) {
  return (
    <Field.Root
      className={[styles.textField, className].filter(Boolean).join(' ')}
      disabled={disabled}
      invalid={error ? true : undefined}
    >
      <div className={styles.box}>
        <Field.Label className={styles.label}>{label}</Field.Label>
        <Input className={styles.input} {...input} />
      </div>
      <div className={styles.message}>
        {error ? (
          <Field.Error match className={styles.error}>
            {error}
          </Field.Error>
        ) : hint ? (
          <Field.Description className={styles.hint}>{hint}</Field.Description>
        ) : null}
      </div>
    </Field.Root>
  );
}
