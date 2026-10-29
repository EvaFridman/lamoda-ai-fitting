'use client';

import Image from 'next/image';
import { type RefObject, useId, useState } from 'react';

import {
  type Fitting,
  fittingErrorText,
  fittingRefusal,
  type StartedFitting,
  useRegenerateFitting,
} from '@/entities/fitting';
import { bySlot } from '@/entities/fitting-room';
import { useTrackedElement } from '@/shared/analytics';
import { errorText } from '@/shared/api';
import { AnchoredPanel, Button, Chip, ChipGroup, Notice } from '@/shared/ui';

import styles from './regenerate-popover.module.scss';

// The comment's limit (A16, A70).
export const MAX_COMMENT_LENGTH = 300;

// What the comment may ask, in place of its label (spec 0023 Y9; the text check allows it, Y12).
const COMMENT_HINT =
  'Можно попросить: изменить посадку, длину, заправить вещь, другую позу или фон. Нельзя: заменить вещь или её цвет — для этого выберите другой цвет или вещь.';

// The comment with the item of «Какая именно?» before it (A92.2): «Тренч Nord: короче, чем…»,
// within the comment's limit; none chosen leaves the comment as it is.
export function commentWithItem(comment: string, itemName: string | null): string {
  const text = comment.trim();
  if (itemName === null) return text;
  return (text ? `${itemName}: ${text}` : itemName).slice(0, MAX_COMMENT_LENGTH);
}

export interface RegeneratePopoverProps {
  // The result to regenerate; a look's items are offered in «Какая именно?» (board 8.3).
  fitting: Fitting;
  // The button the popover rises over («Хотите что-то поменять…»); the focus returns to it.
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // At the click, before the request: the placer closes the popover and shows the wait at once (spec
  // 0024 AC19), keeping this component mounted so the answer reaches it.
  onStart?: () => void;
  onStarted: (fitting: StartedFitting) => void;
  // The api refused at the month's limit.
  onLimit: () => void;
  // Any other failure (the comment refused too): the placer opens the popover again, which says it.
  onFailed?: () => void;
}

// «Что поменять?» (board 7.3, spec 0019 AC8, AC9; no chips, spec 0023 P33, P34): the hint, an
// optional comment and «Перегенерировать», which an empty comment sends too (one more attempt, Y9).
// The new result is a new entry of the history; a try-on's own result regenerates once for free,
// any other regeneration spends a try-on (A6, A70). A comment the check refuses is said under it
// (PROMPT_REFUSED) and spends nothing. On every width the kit's AnchoredPanel rising over its
// button inside the result, the rest of the window dimmed (spec 0024 R13, plan §4.4).
export function RegeneratePopover({
  fitting,
  anchor,
  open,
  onOpenChange,
  onStart,
  onStarted,
  onLimit,
  onFailed,
}: RegeneratePopoverProps) {
  const [comment, setComment] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const regenerate = useRegenerateFitting();
  // «Какая именно?» (board 8.3): a look's items in the slots' order, as its result lists them, an
  // optional choice of every look (Y9).
  const lookItems = fitting.kind === 'look' ? bySlot(fitting.items) : [];
  const asksItem = lookItems.length > 1;
  const itemName = asksItem
    ? (lookItems.find((item) => item.productId === itemId)?.name ?? null)
    : null;
  // The item's name goes before the comment, so the field takes that much less.
  const commentMax =
    itemName === null ? MAX_COMMENT_LENGTH : MAX_COMMENT_LENGTH - itemName.length - 2;
  const tracked = useTrackedElement('result.regenerate', {
    with_comment: comment.trim() !== '',
    with_item: itemName !== null,
    free: fitting.regenerationFree,
  });
  const commentId = useId();
  const hintId = useId();
  const counterId = useId();
  const itemsId = useId();

  const refusal = regenerate.isError ? fittingRefusal(regenerate.error) : null;
  const commentError = refusal === 'prompt_refused' ? fittingErrorText(regenerate.error) : null;
  const failure = regenerate.isError && refusal === null ? errorText(regenerate.error) : null;

  function changeOpen(next: boolean) {
    // The user does not close it while a regeneration is on its way: its placer closes it at
    // `onStart` and opens it again on a failure, which it then says.
    if (!next && regenerate.isPending) return;
    if (!next) regenerate.reset();
    onOpenChange(next);
  }

  function submit() {
    tracked.onClick();
    if (regenerate.isPending) return;
    const text = commentWithItem(comment, itemName);
    onStart?.();
    regenerate.mutate(
      {
        parentId: fitting.id,
        kind: fitting.kind,
        comment: text || undefined,
        // The comment the user typed, not the item's name alone (`with_prompt`).
        withComment: comment.trim() !== '',
        source: 'regenerate',
      },
      {
        onSuccess: (started) => {
          setComment('');
          setItemId(null);
          onStarted(started);
        },
        onError: (error) => {
          if (fittingRefusal(error) === 'limit_reached') onLimit();
          else onFailed?.();
        },
      },
    );
  }

  const body = (
    <div className={styles.body}>
      {asksItem && (
        <div className={styles.field}>
          <span className={styles.label} id={itemsId}>
            Какая именно?
          </span>
          <ChipGroup
            value={itemId === null ? [] : [itemId]}
            multiple={false}
            onValueChange={(next) => {
              const id = next[0] ?? null;
              setItemId(id);
              // The comment gives way to the item's name at once, so what is sent is what shows.
              const name = lookItems.find((item) => item.productId === id)?.name;
              if (name !== undefined) {
                setComment((text) => text.slice(0, MAX_COMMENT_LENGTH - name.length - 2));
              }
            }}
            aria-labelledby={itemsId}
            disabled={regenerate.isPending}
          >
            {lookItems.map((item) => (
              <Chip key={item.productId} value={item.productId}>
                {item.imageUrl && (
                  <Image
                    className={styles.itemImage}
                    src={item.imageUrl}
                    alt=""
                    width={24}
                    height={32}
                    unoptimized
                  />
                )}
                {item.name}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      )}
      <div className={styles.field}>
        <label className={styles.hiddenLabel} htmlFor={commentId}>
          Что поменять
        </label>
        <p id={hintId} className={styles.hint}>
          {COMMENT_HINT}
        </p>
        {/* The text stays out of attributes: recordings keep them (spec 0008), and the whole
            popover is `mp-block`. */}
        <textarea
          id={commentId}
          className={[styles.area, commentError && styles.invalid].filter(Boolean).join(' ')}
          value={comment}
          maxLength={commentMax}
          aria-describedby={`${hintId} ${counterId}`}
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
          {comment.length} / {commentMax}
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
    <>
      <Button
        fullWidth
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
    </>
  );

  return (
    <AnchoredPanel
      title="Что поменять?"
      anchor={anchor}
      open={open}
      onOpenChange={changeOpen}
      footer={footer}
      className="mp-block"
    >
      {body}
    </AnchoredPanel>
  );
}
