'use client';

import Image from 'next/image';

import {
  type FittingFailure,
  type ModerationStage,
  type SafetyCategory,
  triesLeftTail,
} from '@/entities/fitting';
import { useTrackedElement } from '@/shared/analytics';
import { PHONE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import { Button, InfoIcon, Notice } from '@/shared/ui';

import { failureText } from '../lib/failure-text';

import styles from './fitting-error-card.module.scss';

export interface FittingErrorCardProps {
  failure: FittingFailure;
  // A `moderation` failure's category and stage (spec 0023 Y2); null reads as `unknown`, `input`.
  category?: SafetyCategory | null;
  stage?: ModerationStage | null;
  // A failed fitting spends none (A20), but a cancelled or stuck one stays spent (A47, A68): then
  // the card does not say «Примерка не списана» (A79.3).
  spent: boolean;
  // The try-ons of the month left.
  left: number | undefined;
  // The photo the fitting used (a signed link), dimmed; null: a grey frame.
  photoUrl: string | null;
  onRetry: () => void;
  retrying?: boolean;
  // «Закрыть» of card А.
  onClose: () => void;
  // «Другое фото» of card Б: back to the photo picker.
  onOtherPhoto: () => void;
  // A failure of the retry itself, already in Russian.
  error?: string | null;
}

// Board 12 (spec 0019 AC11): card А when the model did not answer (or failed), card Б when the
// moderation refused, its text by the stage and category (spec 0023 plan §4.5); both say the
// try-on was not spent, unless it was.
export function FittingErrorCard({
  failure,
  category = null,
  stage = null,
  spent,
  left,
  photoUrl,
  onRetry,
  retrying = false,
  onClose,
  onOtherPhoto,
  error,
}: FittingErrorCardProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const retry = useTrackedElement('try-on.retry');
  const close = useTrackedElement('try-on.close', { screen: 'error' });
  const otherPhoto = useTrackedElement('try-on.other-photo');
  const moderated = failure === 'moderation';
  const text = failureText(failure, category, stage);

  return (
    <div className={styles.card} role="alert">
      {moderated ? (
        <div className={styles.hidden}>
          <span>Результат скрыт</span>
        </div>
      ) : (
        <div className={['mp-block', styles.photo].join(' ')}>
          {photoUrl && <Image src={photoUrl} alt="" fill sizes="200px" unoptimized />}
        </div>
      )}
      <div className={styles.body}>
        <p className={styles.kicker}>
          <InfoIcon size={16} />
          Ошибка
        </p>
        <h3 className={styles.title}>{text.title}</h3>
        <p className={styles.text}>{text.text}</p>
        {!spent && (
          <Notice tone="success">
            Примерка не списана{left === undefined ? '' : ` · ${triesLeftTail(left)}`}
          </Notice>
        )}
        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
        <div className={styles.actions}>
          <Button
            fullWidth={phone}
            className={styles.primary}
            loading={retrying}
            onClick={() => {
              retry.onClick();
              onRetry();
            }}
            onPointerEnter={retry.onPointerEnter}
            onPointerLeave={retry.onPointerLeave}
          >
            Попробовать ещё раз
          </Button>
          {moderated ? (
            <Button
              variant="outline"
              fullWidth={phone}
              onClick={() => {
                otherPhoto.onClick();
                onOtherPhoto();
              }}
              onPointerEnter={otherPhoto.onPointerEnter}
              onPointerLeave={otherPhoto.onPointerLeave}
            >
              {phone ? 'Выбрать другое фото' : 'Другое фото'}
            </Button>
          ) : (
            <Button
              variant="outline"
              fullWidth={phone}
              onClick={() => {
                close.onClick();
                onClose();
              }}
              onPointerEnter={close.onPointerEnter}
              onPointerLeave={close.onPointerLeave}
            >
              Закрыть
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
