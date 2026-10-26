'use client';

import Image from 'next/image';
import { type UIEvent, useState } from 'react';

import styles from './gallery.module.scss';

export interface GalleryImage {
  // The item's key (a product image's id): two images may share an address (spec 0019 A85).
  id: string;
  src: string;
  // What the photo shows; the first one names the product, the rest may be empty.
  alt: string;
}

export interface GalleryProps {
  images: readonly GalleryImage[];
  // The list's name for screen readers ("Фото товара").
  'aria-label': string;
  className?: string;
}

// The large photos on a wide screen, side by side.
const LARGE = 2;
// The small ones under them before «Показать ещё фото».
const SMALL = 3;

// A product's photos (board 1). From 600px: the first two large side by side, up to three small
// under them, the last of those with «Показать ещё фото» while more are left; the button shows the
// rest, all large. Below 600px: one photo at a time, swiped (scroll snap), covering a slide as high
// as the window less the page's `--gallery-offset`, with Lamoda's dots above the page's
// `--gallery-overlap` (spec 0019 A87.1, A88). One list for both, switched by CSS. Catalog photos come from /media/, which never reaches the
// optimizer (spec 0011 M29).
export function Gallery({ images, 'aria-label': label, className }: GalleryProps) {
  const [expanded, setExpanded] = useState(false);
  const [current, setCurrent] = useState(0);
  const collapsible = !expanded && images.length > LARGE + SMALL;

  // The photo in view on a phone: the strip scrolls by whole slides.
  function onScroll(event: UIEvent<HTMLUListElement>) {
    const strip = event.currentTarget;
    if (strip.clientWidth === 0) return;
    setCurrent(Math.round(strip.scrollLeft / strip.clientWidth));
  }

  return (
    <div className={[styles.gallery, className].filter(Boolean).join(' ')}>
      <ul className={styles.list} aria-label={label} onScroll={onScroll}>
        {images.map((image, index) => {
          const small = !expanded && index >= LARGE;
          const hidden = collapsible && index >= LARGE + SMALL;
          const last = collapsible && index === LARGE + SMALL - 1;
          return (
            <li
              key={image.id}
              className={[styles.item, small && styles.small, hidden && styles.extra]
                .filter(Boolean)
                .join(' ')}
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes="(max-width: 600px) 100vw, (max-width: 1280px) 50vw, 432px"
                loading={index < LARGE ? 'eager' : 'lazy'}
                unoptimized
                className={styles.image}
              />
              {last && (
                <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
                  Показать ещё фото
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {images.length > 1 && (
        <span className={styles.dots} aria-hidden>
          {images.map((image, index) => (
            <span
              key={image.id}
              className={[styles.dot, index === current && styles.on].filter(Boolean).join(' ')}
            />
          ))}
        </span>
      )}
    </div>
  );
}
