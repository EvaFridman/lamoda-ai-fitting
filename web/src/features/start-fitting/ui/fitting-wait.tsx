'use client';

import { useEffect, useState } from 'react';

import {
  type Fitting,
  FITTING_STEPS,
  fittingProgress,
  type FittingStep,
  itemWord,
  timeLeftText,
} from '@/entities/fitting';
import { useTrackedElement } from '@/shared/analytics';
import { PHONE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import { Button, CheckIcon, Notice, ProgressBar, Spinner } from '@/shared/ui';

import { TryOnLoader } from './try-on-loader';
import { WaitItems } from './wait-items';

import styles from './fitting-wait.module.scss';

// The canvas's stages: done, then the current one (board 6).
function stepText(step: FittingStep, item: string, done: boolean): string {
  switch (step) {
    case 'checked':
      return 'Проверили фото';
    case 'pose':
      return done ? 'Определили позу и фигуру' : 'Определяем позу и фигуру';
    case 'dressing':
      return done ? `Надели ${item}` : `Надеваем ${item}`;
    case 'details':
      return 'Прорисовываем детали';
  }
}

// The clock the estimate follows: a second's tick while the screen shows.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export interface FittingWaitProps {
  // The fitting that runs.
  fitting: Fitting;
  // The photo it uses (a signed link), or null.
  photoUrl: string | null;
  // «Закрыть и продолжить покупки» (spec 0024 AC15, every width): the window closes, the fitting
  // goes on.
  onClose: () => void;
}

// Board 6, the wait (spec 0019 AC10, A27): the blurred photo with the sweeping dots, the item, the
// current stage with the percent, the bar and the time left by the estimate (the stages done and
// to come under it on a wide screen), the note that the page can be closed, and the button that
// closes the window while the fitting goes on.
export function FittingWait({ fitting, photoUrl, onClose }: FittingWaitProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const now = useNow();
  const close = useTrackedElement('try-on.close', { screen: 'wait' });
  const progress = fittingProgress(fitting.createdAt, fitting.estimatedSeconds, now);
  const look = fitting.kind === 'look';
  // A look shows its items as the row under the progress (A62), a single item its own above it,
  // both at 72×96 on every width (spec 0024 Z7).
  const item = look ? undefined : fitting.items[0];
  const word = look ? 'образ' : item ? itemWord(item.name) : 'вещь';
  const current = FITTING_STEPS.indexOf(progress.step);

  return (
    <div className={styles.wait} aria-busy="true">
      <TryOnLoader photoUrl={photoUrl} />
      <div className={styles.side}>
        {item && <WaitItems items={[item]} />}
        <div className={styles.progress}>
          <p className={styles.progressHead}>
            <span className={phone ? styles.stepNow : styles.title}>
              {phone ? stepText(progress.step, word, false) : 'Примеряем…'}
            </span>
            <span className={styles.percent}>{progress.percent}%</span>
          </p>
          <ProgressBar value={progress.percent} aria-label="Прогресс примерки" />
          <p className={styles.muted}>{timeLeftText(progress.secondsLeft)}</p>
          {look && <WaitItems items={fitting.items} />}
        </div>
        {!phone && (
          <ol className={styles.steps}>
            {FITTING_STEPS.map((step, index) => (
              <li
                key={step}
                className={
                  index < current ? styles.done : index === current ? styles.now : styles.next
                }
              >
                <span className={styles.mark} aria-hidden>
                  {index < current ? (
                    <CheckIcon size={16} />
                  ) : index === current ? (
                    <Spinner size={24} />
                  ) : null}
                </span>
                {stepText(step, word, index < current)}
              </li>
            ))}
          </ol>
        )}
        <div className={styles.footer}>
          {phone ? (
            <p className={styles.closeNote}>
              Можно закрыть страницу — результат сохранится в истории
            </p>
          ) : (
            <Notice>
              Можно закрыть страницу — результат сохранится в истории. Пришлём уведомление, когда
              будет готово.
            </Notice>
          )}
          <Button
            variant="outline"
            fullWidth
            onClick={() => {
              close.onClick();
              onClose();
            }}
            onPointerEnter={close.onPointerEnter}
            onPointerLeave={close.onPointerLeave}
          >
            Закрыть и продолжить покупки
          </Button>
        </div>
      </div>
    </div>
  );
}
