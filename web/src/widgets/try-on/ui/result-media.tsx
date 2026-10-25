'use client';

import Image from 'next/image';
import { type ReactNode, type RefObject, useEffect, useState } from 'react';

import {
  AiLabel,
  type Fitting,
  fittingProgress,
  type FittingProgress,
  timeLeftText,
} from '@/entities/fitting';
import { TryOnLoader } from '@/features/start-fitting';
import { useTrackedElement } from '@/shared/analytics';
import { DownloadIcon, FullscreenIcon, ProgressBar } from '@/shared/ui';

import styles from './fitting-result.module.scss';

const SHARE_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <path d="M12 15V4M8 8l4-4 4 4M5 12v8h14v-8" />
  </svg>
);

// Saves the result: a link made on the click and dropped at once, so the signed link never sits in
// the page's markup (A37). The storage's link is another origin, where `download` does not apply:
// the picture opens in a new tab, from which it is saved.
function download(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = 'primerka.webp';
  link.target = '_blank';
  link.rel = 'noopener';
  link.click();
}

// The progress of a fitting that runs over a result (boards 7.2, 8.2), a second's tick while it
// runs; null while none does.
export function useRunningProgress(running: Fitting | null): FittingProgress | null {
  const [now, setNow] = useState(() => Date.now());
  const active = running !== null;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return running ? fittingProgress(running.createdAt, running.estimatedSeconds, now) : null;
}

export interface ResultPictureProps {
  fitting: Fitting;
  // A fitting running over it (a colour): the picture dims under its progress.
  running: Fitting | null;
  progress: FittingProgress | null;
  // «Примеряем красный…» over the picture; none: no plate (the look's is beside it, board 8.2).
  runningLabel?: string;
  alt: string;
  pictureRef: RefObject<HTMLDivElement | null>;
}

// The result's picture with «Сгенерировано ИИ» (boards 7, 8): only an image's `src`, in an
// `mp-block` container (A37).
export function ResultPicture({
  fitting,
  running,
  progress,
  runningLabel,
  alt,
  pictureRef,
}: ResultPictureProps) {
  if (running) {
    return (
      <TryOnLoader photoUrl={fitting.resultUrl} className={styles.picture}>
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
    <div ref={pictureRef} className={['mp-block', styles.picture].join(' ')}>
      {fitting.resultUrl && (
        <Image
          className={styles.image}
          src={fitting.resultUrl}
          alt={alt}
          fill
          sizes="540px"
          unoptimized
        />
      )}
      <AiLabel />
    </div>
  );
}

export interface ResultTilesProps {
  fitting: Fitting;
  running: Fitting | null;
  pictureRef: RefObject<HTMLDivElement | null>;
  phone: boolean;
  // A tile after the three (one item's «К образу», A90.11); a look has none (board 8).
  children?: ReactNode;
}

// Board 13's ResultActions: «Поделиться» (disabled, A14), «Скачать», «Во весь экран», and the
// caller's tile, if any.
export function ResultTiles({ fitting, running, pictureRef, phone, children }: ResultTilesProps) {
  const downloadElement = useTrackedElement('result.download');
  const fullscreenElement = useTrackedElement('result.fullscreen');
  const off = running !== null || !fitting.resultUrl;
  return (
    <div
      className={[styles.tiles, !children && styles.threeTiles].filter(Boolean).join(' ')}
      role="group"
      aria-label="Действия с изображением"
    >
      <button type="button" className={styles.tile} disabled>
        {SHARE_ICON}
        Поделиться
      </button>
      <button
        type="button"
        className={styles.tile}
        disabled={off}
        onClick={() => {
          downloadElement.onClick();
          if (fitting.resultUrl) download(fitting.resultUrl);
        }}
        onPointerEnter={downloadElement.onPointerEnter}
        onPointerLeave={downloadElement.onPointerLeave}
      >
        <DownloadIcon />
        Скачать
      </button>
      <button
        type="button"
        className={styles.tile}
        disabled={off}
        onClick={() => {
          fullscreenElement.onClick();
          void pictureRef.current?.requestFullscreen?.().catch(() => undefined);
        }}
        onPointerEnter={fullscreenElement.onPointerEnter}
        onPointerLeave={fullscreenElement.onPointerLeave}
      >
        <FullscreenIcon />
        {phone ? 'Экран' : 'Во весь экран'}
      </button>
      {children}
    </div>
  );
}
