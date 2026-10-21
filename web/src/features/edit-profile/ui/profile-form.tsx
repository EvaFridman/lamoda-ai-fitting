'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useId, useRef, useState } from 'react';

import { refreshSession } from '@/entities/session';
import { type Gender, updateMe, type UpdateMeBody, type User, userKeys } from '@/entities/user';
import { track } from '@/shared/analytics';
import { ApiError, detailText, errorText, reportFailure } from '@/shared/api';
import { Button, Radio, RadioGroup, showToast, TextField } from '@/shared/ui';

import { caretAfterDigits, maskDate } from '../lib/date-mask';
import {
  changesOf,
  dateError,
  hasChanges,
  NAME_FIELDS,
  type NameField,
  type ProfileField,
  type ProfileValues,
  valuesOf,
} from '../lib/profile-values';

import styles from './profile-form.module.scss';

const FIELDS: readonly ProfileField[] = [
  'lastName',
  'firstName',
  'patronymic',
  'dateOfBirth',
  'gender',
];

type TextFieldName = NameField | 'dateOfBirth';
const TEXT_FIELDS: readonly TextFieldName[] = [...NAME_FIELDS, 'dateOfBirth'];

type FieldErrors = Partial<Record<ProfileField, string>>;

// The first detail of each form field in a 400 `VALIDATION_FAILED`; `undefined` for any other
// failure, or one whose details name none of the fields.
function fieldErrorsOf(failure: unknown): FieldErrors | undefined {
  if (!(failure instanceof ApiError) || failure.code !== 'VALIDATION_FAILED') return undefined;
  const errors: FieldErrors = {};
  for (const detail of failure.details) {
    const field = FIELDS.find((name) => name === detail.field);
    if (field && errors[field] === undefined) errors[field] = detailText(detail);
  }
  return Object.keys(errors).length > 0 ? errors : undefined;
}

export interface ProfileFormProps {
  // The saved user, from `/me`.
  user: User;
}

// "Мои данные"'s form (spec 0017 U2, U8, U9, plan §5): the names, the date of birth and the gender,
// always editable, and the email as text (it comes from Google). "Сохранить" is active while a
// field differs from the saved data, and only those fields are sent. A save puts the answer into
// the cache, so the page does not read `/me` again, and refreshes the session when the first name,
// the header's name, changed. Its errors show under their fields, any other failure in a toast,
// and what was typed stays (AC12). Every value is personal data: the whole form is `mp-block`, and
// the text fields are uncontrolled, as the kit's `SearchField` (L9): a controlled input gets its
// value as an attribute, which recordings and the SDK's click events keep, so the text lives only
// in the DOM value, read from and written to the input (plan §7). Render it with `key` = the
// user's id: the starting text is taken once.
export function ProfileForm({ user }: ProfileFormProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ProfileValues>(() => valuesOf(user));
  const [errors, setErrors] = useState<FieldErrors>({});
  const genderTitleId = useId();
  // Set and read in the same event, unlike `isPending`: a second Enter or click before the next
  // render sends nothing.
  const savingRef = useRef(false);

  // The mounted text inputs by their `name`, and one ref callback for them, made once: it puts the
  // field's starting text into the DOM value as the input mounts, before Base UI's Field reads it
  // for its `data-filled` (a layout effect of the input's parent). Once per input: React attaches
  // the ref again when a hidden page comes back (Next keeps it in `<Activity>`), and what was
  // typed or saved since must stay.
  const [{ inputs, attachInput }] = useState(() => {
    const start = valuesOf(user);
    const mounted = new Map<TextFieldName, HTMLInputElement>();
    const started = new WeakSet<HTMLInputElement>();
    const attach = (node: HTMLInputElement) => {
      const field = TEXT_FIELDS.find((name) => name === node.name);
      if (!field) return undefined;
      mounted.set(field, node);
      if (!started.has(node)) {
        started.add(node);
        node.value = start[field];
      }
      return () => {
        mounted.delete(field);
      };
    };
    return { inputs: mounted, attachInput: attach };
  });

  const save = useMutation({
    mutationFn: (body: UpdateMeBody) => updateMe(body),
    // The body and the answer are personal data: not kept in the mutation cache once the form is
    // gone (spec 0017 U22).
    gcTime: 0,
    onSettled: () => {
      savingRef.current = false;
    },
    onSuccess: (saved, body) => {
      // Only over the same user's answer: one reset for another user while the save was on its way
      // (`useDropUserQueries`) stays reset.
      if (queryClient.getQueryData<User>(userKeys.me)?.id === saved.id) {
        queryClient.setQueryData(userKeys.me, saved);
      }
      showToast({ title: 'Данные сохранены' });
      track('Account Data Saved', {});
      // A failed refresh only leaves the header's name behind for up to 5 minutes; `callAuth` has
      // reported it.
      if ('firstName' in body) refreshSession().catch(() => undefined);
      // A name saved trimmed shows as saved, unless it was edited again while saving.
      for (const field of NAME_FIELDS) {
        const input = inputs.get(field);
        const text = saved[field] ?? '';
        if (!(field in body) || !input || input.value === text || input.value.trim() !== text) {
          continue;
        }
        input.value = text;
        setValues((current) => ({ ...current, [field]: text }));
      }
    },
    onError: (failure) => {
      const fieldErrors = fieldErrorsOf(failure);
      if (fieldErrors) {
        setErrors(fieldErrors);
        return;
      }
      showToast({ title: errorText(failure), tone: 'error' });
      reportFailure(failure);
    },
  });

  function change<Field extends ProfileField>(field: Field, value: ProfileValues[Field]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  // The mask rewrites the whole value; the caret stays after the digits that were before it.
  function changeDate(typed: string) {
    const masked = maskDate(typed);
    const input = inputs.get('dateOfBirth');
    if (input && input.value !== masked) {
      const caret = input.selectionStart ?? typed.length;
      const digitsBefore = typed.slice(0, caret).replace(/\D/g, '').length;
      input.value = masked;
      const at = caretAfterDigits(masked, digitsBefore);
      input.setSelectionRange(at, at);
    }
    change('dateOfBirth', masked);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter in a field submits too, past the button's `loading` and `disabled`.
    if (savingRef.current || !hasChanges(values, user)) return;
    const invalidDate = dateError(values.dateOfBirth);
    if (invalidDate) {
      setErrors((current) => ({ ...current, dateOfBirth: invalidDate }));
      return;
    }
    savingRef.current = true;
    save.mutate(changesOf(values, user));
  }

  return (
    <form className={`${styles.form} mp-block`} noValidate onSubmit={submit}>
      <div className={styles.names}>
        <TextField
          label="Фамилия"
          autoComplete="family-name"
          name="lastName"
          ref={attachInput}
          onValueChange={(value) => change('lastName', value)}
          error={errors.lastName}
        />
        <TextField
          label="Имя"
          autoComplete="given-name"
          name="firstName"
          ref={attachInput}
          onValueChange={(value) => change('firstName', value)}
          error={errors.firstName}
        />
        <TextField
          label="Отчество"
          autoComplete="additional-name"
          name="patronymic"
          ref={attachInput}
          onValueChange={(value) => change('patronymic', value)}
          error={errors.patronymic}
        />
      </div>
      <TextField
        className={styles.date}
        label="Дата рождения"
        hint="ДД.ММ.ГГГГ"
        inputMode="numeric"
        autoComplete="off"
        name="dateOfBirth"
        ref={attachInput}
        onValueChange={changeDate}
        error={errors.dateOfBirth}
      />
      <div className={styles.group}>
        <p id={genderTitleId} className={styles.groupTitle}>
          Пол
        </p>
        <RadioGroup<Gender | null>
          aria-labelledby={genderTitleId}
          className={styles.genders}
          value={values.gender}
          onValueChange={(value) => {
            if (value !== null) change('gender', value);
          }}
        >
          <Radio value="male">Мужской</Radio>
          <Radio value="female">Женский</Radio>
        </RadioGroup>
        {errors.gender && <p className={styles.error}>{errors.gender}</p>}
      </div>
      <div className={styles.group}>
        <p className={styles.groupTitle}>E-mail</p>
        <p className={styles.email}>{user.email}</p>
      </div>
      <Button
        type="submit"
        className={styles.submit}
        disabled={!hasChanges(values, user)}
        loading={save.isPending}
      >
        Сохранить
      </Button>
    </form>
  );
}
