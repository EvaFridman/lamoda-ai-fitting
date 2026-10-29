'use client';

import { Dialog } from '@base-ui/react/dialog';
import Image from 'next/image';
import { type KeyboardEvent, type UIEvent, useCallback, useRef, useState } from 'react';

import { MOUSE_QUERY, REDUCED_MOTION_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';

import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '../icon/icons';

import type { GalleryImage } from './gallery';
import styles from './gallery-viewer.module.scss';

export interface GalleryViewerProps {
  images: readonly GalleryImage[];
  // The photo it shows, from 0; `null` while it is closed.
  index: number | null;
  onClose: () => void;
  // The window's name for screen readers: the gallery's.
  title: string;
  // The element focused when it closes: the photo it opened from (Safari focuses no clicked
  // button, so Base UI's own return would land on the page's body).
  finalFocus?: () => HTMLElement | true | null;
}

// The gallery's full screen (spec 0023 P2): the whole window, black, each photo whole. The photos
// are one strip of whole-window slides with scroll snap, so a finger swipes them; with a mouse «‹»
// and «›» turn them, disabled at the ends. The arrow keys turn them on any device, «N из M» says
// which one is in view, the × and Escape close it, and the focus returns to the photo it opened
// from. Base UI's Dialog, as the kit's `Modal`, whose white frame and heading it does not have.
export function GalleryViewer({ images, index, onClose, title, finalFocus }: GalleryViewerProps) {
  const mouse = useMediaQuery(MOUSE_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const [current, setCurrent] = useState(0);
  const stripRef = useRef<HTMLUListElement | null>(null);
  // The photo a smooth scroll of the arrows or keys is going to, until it gets there.
  const glideRef = useRef<number | null>(null);
  // Opened on the ×, not on «‹», which is off at the first photo.
  const closeRef = useRef<HTMLButtonElement>(null);

  // Opened at a photo: the strip starts there, with no scroll to watch.
  const start = useCallback(
    (strip: HTMLUListElement | null) => {
      stripRef.current = strip;
      if (!strip || index === null) return;
      strip.scrollLeft = index * strip.clientWidth;
      setCurrent(index);
    },
    [index],
  );

  function onScroll(event: UIEvent<HTMLUListElement>) {
    const strip = event.currentTarget;
    if (strip.clientWidth === 0) return;
    const shown = Math.round(strip.scrollLeft / strip.clientWidth);
    // By the index, not the pixel: a slide's width may be fractional while `clientWidth` is not.
    if (glideRef.current !== null) {
      if (shown !== glideRef.current) return;
      glideRef.current = null;
    }
    setCurrent(shown);
  }

  // A finger or a wheel takes the strip over from a glide.
  function stopGlide() {
    glideRef.current = null;
  }

  function go(next: number) {
    if (next < 0 || next >= images.length) return;
    setCurrent(next);
    const strip = stripRef.current;
    if (!strip) return;
    // The browser's own smooth curve, as `ScrollRow`'s arrows (spec 0024 Z26.3); none under reduced
    // motion. While it glides, the counter keeps the photo it goes to.
    glideRef.current = reducedMotion ? null : next;
    strip.scrollTo?.({
      left: next * strip.clientWidth,
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') go(current - 1);
    else if (event.key === 'ArrowRight') go(current + 1);
    else return;
    event.preventDefault();
  }

  const atStart = current === 0;
  const atEnd = current === images.length - 1;

  return (
    <Dialog.Root
      open={index !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Popup
          className={styles.viewer}
          onKeyDown={onKeyDown}
          initialFocus={closeRef}
          finalFocus={finalFocus ? () => finalFocus() : undefined}
        >
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          <ul
            className={styles.strip}
            ref={start}
            onScroll={onScroll}
            onPointerDown={stopGlide}
            onTouchStart={stopGlide}
            onWheel={stopGlide}
          >
            {images.map((image, position) => (
              <li
                key={image.id}
                className={styles.slide}
                aria-hidden={position !== current || undefined}
              >
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes="100vw"
                  loading={position === index ? 'eager' : 'lazy'}
                  unoptimized
                  className={styles.image}
                />
              </li>
            ))}
          </ul>
          <p className={styles.counter} aria-live="polite">
            {current + 1} из {images.length}
          </p>
          {mouse && images.length > 1 && (
            <>
              <button
                type="button"
                className={[styles.arrow, styles.prev].join(' ')}
                aria-label="Предыдущее фото"
                // Not `disabled`, as `ScrollRow`'s: an arrow that turns off under the focus keeps it.
                aria-disabled={atStart}
                onClick={() => go(current - 1)}
              >
                <ChevronLeftIcon />
              </button>
              <button
                type="button"
                className={[styles.arrow, styles.next].join(' ')}
                aria-label="Следующее фото"
                aria-disabled={atEnd}
                onClick={() => go(current + 1)}
              >
                <ChevronRightIcon />
              </button>
            </>
          )}
          <Dialog.Close ref={closeRef} className={styles.close} aria-label="Закрыть">
            <CloseIcon />
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
