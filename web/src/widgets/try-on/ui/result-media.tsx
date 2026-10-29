'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import {
  AiLabel,
  type Fitting,
  fittingProgress,
  type FittingProgress,
  PhotoFrame,
  timeLeftText,
} from '@/entities/fitting';
import { useFittingImageDownload } from '@/features/download-fitting';
import { useFittingShare } from '@/features/share-fitting';
import { type PendingFitting, TryOnLoader } from '@/features/start-fitting';
import { useTrackedElement } from '@/shared/analytics';
import { COARSE_POINTER_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import {
  DownloadIcon,
  GalleryViewer,
  IconButton,
  ProgressBar,
  ShareIcon,
  Tooltip,
} from '@/shared/ui';

import styles from './fitting-result.module.scss';

// The progress of a fitting that runs over a result (boards 7.2, 8.2), a second's tick while it
// runs; null while none does. `origin`: the click that started it in this window (spec 0024
// AC19), else its `createdAt`.
export function useRunningProgress(
  running: PendingFitting | null,
  origin?: number,
): FittingProgress | null {
  const [now, setNow] = useState(() => Date.now());
  const active = running !== null;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return running
    ? fittingProgress(origin ?? running.createdAt, running.estimatedSeconds, now)
    : null;
}

export interface ResultPictureProps {
  fitting: Fitting;
  // A fitting running over it (a colour), or its start on its way: the picture dims under its
  // progress.
  running: PendingFitting | null;
  progress: FittingProgress | null;
  // «Примеряем красный…» over the picture; none: no plate (the look's is beside it, board 8.2).
  runningLabel?: string;
  alt: string;
}

// The result's picture with «Сгенерировано ИИ» (boards 7, 8) in the try-on's one frame (spec 0023
// P24): only an image's `src` (A37). A click on it opens the kit's `GalleryViewer`, its full screen
// with the one photo, × and Escape (spec 0024 AC23); over it, bottom right, «Скачать» and
// «Поделиться» as round icons, shown on hover and focus with a mouse and always under a finger,
// each in a tooltip of its name (Base UI's never opens by touch).
export function ResultPicture({
  fitting,
  running,
  progress,
  runningLabel,
  alt,
}: ResultPictureProps) {
  const finger = useMediaQuery(COARSE_POINTER_QUERY);
  const [viewing, setViewing] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const shown = running === null && fitting.resultUrl !== null;
  const saving = useFittingImageDownload();
  // The file is fetched ahead for Safari's share (plan §4.3): on the first hover with a mouse, at
  // once under a finger.
  const sharing = useFittingShare({
    fittingId: shown ? fitting.id : null,
    eager: shown && finger,
  });
  const pictureElement = useTrackedElement('result.picture');
  const downloadElement = useTrackedElement('result.download');
  const shareElement = useTrackedElement('result.share', { method: sharing.method });

  if (running) {
    return (
      <TryOnLoader photoUrl={fitting.resultUrl}>
        {progress && runningLabel && (
          <div className={styles.runningBox}>
            <p className={styles.runningHead}>
              <span>{runningLabel}</span>
              <span>{progress.percent}%</span>
            </p>
            <ProgressBar value={progress.percent} aria-label="Прогресс примерки" />
            <span className={styles.muted}>{timeLeftText(progress.secondsLeft)}</span>
          </div>
        )}
      </TryOnLoader>
    );
  }
  return (
    <PhotoFrame className={styles.picture}>
      {fitting.resultUrl && (
        <>
          <button
            ref={openRef}
            type="button"
            className={styles.open}
            aria-label="Открыть во весь экран"
            onClick={() => {
              pictureElement.onClick();
              setViewing(true);
            }}
            onPointerEnter={(event) => {
              pictureElement.onPointerEnter(event);
              if (event.pointerType === 'mouse') sharing.prefetch();
            }}
            onPointerLeave={pictureElement.onPointerLeave}
          >
            <Image src={fitting.resultUrl} alt={alt} fill sizes="480px" unoptimized />
          </button>
          <div
            className={[styles.pictureActions, finger && styles.pictureActionsShown]
              .filter(Boolean)
              .join(' ')}
            role="group"
            aria-label="Действия с изображением"
            // The icons sit over the picture: a pointer reaching them comes from it.
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') sharing.prefetch();
            }}
          >
            <Tooltip content="Скачать">
              <IconButton
                size={44}
                className={styles.pictureAction}
                aria-label="Скачать"
                // Waits focusable while the file loads.
                aria-disabled={saving.pending || undefined}
                onClick={() => {
                  if (saving.pending) return;
                  downloadElement.onClick();
                  saving.download(fitting.id, sharing.file);
                }}
                onPointerEnter={downloadElement.onPointerEnter}
                onPointerLeave={downloadElement.onPointerLeave}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip content="Поделиться">
              <IconButton
                size={44}
                className={styles.pictureAction}
                aria-label="Поделиться"
                aria-disabled={sharing.pending || undefined}
                onClick={() => {
                  if (sharing.pending) return;
                  shareElement.onClick();
                  sharing.share();
                }}
                onPointerEnter={shareElement.onPointerEnter}
                onPointerLeave={shareElement.onPointerLeave}
              >
                <ShareIcon />
              </IconButton>
            </Tooltip>
          </div>
          <GalleryViewer
            images={[{ id: fitting.id, src: fitting.resultUrl, alt }]}
            index={viewing ? 0 : null}
            onClose={() => setViewing(false)}
            title="Результат примерки"
            finalFocus={() => openRef.current ?? true}
            className="mp-block"
          />
        </>
      )}
      <AiLabel />
    </PhotoFrame>
  );
}
