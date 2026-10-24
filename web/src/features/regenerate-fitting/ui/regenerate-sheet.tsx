'use client';

import { useId, useState } from 'react';

import {
  type Fitting,
  fittingRefusal,
  REGENERATE_REASONS,
  type RegenerateReason,
  type StartedFitting,
  useRegenerateFitting,
} from '@/entities/fitting';
import { useTrackedElement } from '@/shared/analytics';
import { errorText } from '@/shared/api';
import { PHONE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import { Button, Chip, ChipGroup, Modal, Notice, Sheet } from '@/shared/ui';

import styles from './regenerate-sheet.module.scss';

// The comment's limit (A16, A70).
export const MAX_COMMENT_LENGTH = 300;

const REASON_TEXTS: Readonly<Record<RegenerateReason, string>> = {
  face: 'Лицо',
  figure: 'Фигура',
  item: 'Вещь',
  background: 'Фон',
  other: 'Другое',
};

// A reason's chip: its click and hover carry the reason and whether it is checked after the click.
function ReasonChip({ reason, checked }: { reason: RegenerateReason; checked: boolean }) {
  const tracked = useTrackedElement('result.reason', { reason, checked: !checked });
  return (
    <Chip value={reason} events={tracked}>
      {REASON_TEXTS[reason]}
    </Chip>
  );
}

export interface RegenerateSheetProps {
  // The result to regenerate.
  fitting: Fitting;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (fitting: StartedFitting) => void;
  // The api refused at the month's limit.
  onLimit: () => void;
}

// «Что поменять?» (board 7.3, spec 0019 AC8, AC9): the reasons, a comment and «Перегенерировать».
// The new result is a new entry of the history; a try-on's own result regenerates once for free,
// any other regeneration spends a try-on (A6, A70). A comment the check refuses is said under it
// (PROMPT_REFUSED) and spends nothing. A bottom sheet on a phone, a modal elsewhere.
export function RegenerateSheet({
  fitting,
  open,
  onOpenChange,
  onStarted,
  onLimit,
}: RegenerateSheetProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [reasons, setReasons] = useState<RegenerateReason[]>([]);
  const [comment, setComment] = useState('');
  const regenerate = useRegenerateFitting();
  const tracked = useTrackedElement('result.regenerate', {
    reasons: reasons.length,
    with_comment: comment.trim() !== '',
    free: fitting.regenerationFree,
  });
  const commentId = useId();
  const counterId = useId();

  const refusal = regenerate.isError ? fittingRefusal(regenerate.error) : null;
  const commentError = refusal === 'prompt_refused' ? errorText(regenerate.error) : null;
  const failure = regenerate.isError && refusal === null ? errorText(regenerate.error) : null;

  function changeOpen(next: boolean) {
    // A regeneration on its way keeps the sheet: it ends in the new fitting or in its error.
    if (!next && regenerate.isPending) return;
    if (!next) regenerate.reset();
    onOpenChange(next);
  }

  function submit() {
    tracked.onClick();
    if (reasons.length === 0 || regenerate.isPending) return;
    const text = comment.trim();
    regenerate.mutate(
      {
        parentId: fitting.id,
        kind: fitting.kind,
        reasons,
        comment: text || undefined,
        source: 'regenerate',
      },
      {
        onSuccess: (started) => {
          setReasons([]);
          setComment('');
          onStarted(started);
        },
        onError: (error) => {
          if (fittingRefusal(error) === 'limit_reached') onLimit();
        },
      },
    );
  }

  const body = (
    <div className={styles.body}>
      <ChipGroup
        value={reasons}
        onValueChange={(next) =>
          setReasons(next.filter((reason) => REGENERATE_REASONS.includes(reason)))
        }
        aria-label="Что получилось неточно"
        disabled={regenerate.isPending}
      >
        {REGENERATE_REASONS.map((reason) => (
          <ReasonChip key={reason} reason={reason} checked={reasons.includes(reason)} />
        ))}
      </ChipGroup>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={commentId}>
          Комментарий, по желанию
        </label>
        {/* The text stays out of attributes: recordings keep them (spec 0008), and the whole
            sheet is `mp-block`. */}
        <textarea
          id={commentId}
          className={[styles.area, commentError && styles.invalid].filter(Boolean).join(' ')}
          value={comment}
          maxLength={MAX_COMMENT_LENGTH}
          aria-describedby={counterId}
          aria-invalid={commentError ? true : undefined}
          disabled={regenerate.isPending}
          onChange={(event) => setComment(event.target.value)}
        />
        {commentError ? (
          <p className={styles.error} role="alert">
            {commentError}
          </p>
        ) : null}
        <p id={counterId} className={styles.counter}>
          {comment.length} / {MAX_COMMENT_LENGTH}
        </p>
      </div>
      {failure && (
        <Notice tone="error" role="alert">
          {failure}
        </Notice>
      )}
    </div>
  );

  const footer = (
    <div className={styles.footer}>
      <Button
        fullWidth
        disabled={reasons.length === 0}
        loading={regenerate.isPending}
        onClick={submit}
        onPointerEnter={tracked.onPointerEnter}
        onPointerLeave={tracked.onPointerLeave}
      >
        Перегенерировать
      </Button>
      <p className={styles.caption}>
        Новый результат появится отдельной записью в истории.{' '}
        {fitting.regenerationFree
          ? 'Первая перегенерация не списывает примерку.'
          : 'Перегенерация списывает 1 примерку.'}
      </p>
    </div>
  );

  const description = 'Отметьте, что получилось неточно — учтём при новой попытке.';
  return phone ? (
    <Sheet
      title="Что поменять?"
      description={description}
      open={open}
      onOpenChange={changeOpen}
      footer={footer}
    >
      <div className="mp-block">{body}</div>
    </Sheet>
  ) : (
    <Modal
      title="Что поменять?"
      description={description}
      open={open}
      onOpenChange={changeOpen}
      footer={footer}
    >
      <div className="mp-block">{body}</div>
    </Modal>
  );
}
