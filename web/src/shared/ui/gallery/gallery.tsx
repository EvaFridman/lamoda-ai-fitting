'use client';

import Image from 'next/image';
import {
  type ButtonHTMLAttributes,
  type PointerEvent,
  type UIEvent,
  useRef,
  useState,
} from 'react';

import { MOUSE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';

import styles from './gallery.module.scss';
import { GalleryViewer } from './gallery-viewer';

export interface GalleryImage {
  // The item's key (a product image's id): two images may share an address (spec 0019 A85).
  id: string;
  src: string;
  // What the photo shows; the first one names the product, the rest may be empty.
  alt: string;
}

export type GalleryPhotoEvents = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'onPointerEnter' | 'onPointerLeave'
>;

export interface GalleryProps {
  images: readonly GalleryImage[];
  // The list's name for screen readers ("Фото товара"), also the full screen's.
  'aria-label': string;
  className?: string;
  // A photo's click and hover, by its index from 0 (the page's analytics).
  photoEvents?: (index: number) => GalleryPhotoEvents;
}

// The large photos on a wide screen, side by side.
const LARGE = 2;
// The small ones under them before «Показать ещё фото».
const SMALL = 3;

// The magnifier's lens: its diameter in px and how much larger the photo shows inside it (Y14).
const LENS = 160;
const ZOOM = 2.5;

// A product's photos (board 1). From 600px: the first two large side by side, up to three small
// under them, the last of those with «Показать ещё фото» while more are left; the button shows the
// rest, all large. Below 600px: one photo at a time, swiped (scroll snap), covering a slide as high
// as the window less the page's `--gallery-offset`, with Lamoda's dots above the page's
// `--gallery-overlap` (spec 0019 A87.1, A88). One list for both, switched by CSS. Catalog photos come from /media/, which never reaches the
// optimizer (spec 0011 M29). A click on a photo opens `GalleryViewer` at it; with a mouse
// (`MOUSE_QUERY`, spec 0023 Y13, Y14) the cursor over a photo is a round lens showing the part
// under it enlarged, the photo itself unchanged. Catalog photos only: the lens puts the photo's
// address in an inline style, where a user's photo may never go (recordings keep attributes).
export function Gallery({ images, 'aria-label': label, className, photoEvents }: GalleryProps) {
  const [expanded, setExpanded] = useState(false);
  const [current, setCurrent] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  // The photos' buttons by index, and the one the full screen opened from, for its focus back.
  const buttonsRef = useRef(new Map<number, HTMLButtonElement>());
  const openedRef = useRef(0);
  const mouse = useMediaQuery(MOUSE_QUERY);
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
              <GalleryPhoto
                image={image}
                position={index + 1}
                total={images.length}
                eager={index < LARGE}
                lens={mouse}
                events={photoEvents?.(index)}
                buttonRef={(button) => {
                  if (button) buttonsRef.current.set(index, button);
                  else buttonsRef.current.delete(index);
                }}
                onOpen={() => {
                  openedRef.current = index;
                  setOpen(index);
                }}
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
      <GalleryViewer
        images={images}
        index={open}
        onClose={() => setOpen(null)}
        title={label}
        finalFocus={() => buttonsRef.current.get(openedRef.current) ?? true}
      />
    </div>
  );
}

interface GalleryPhotoProps {
  image: GalleryImage;
  // From 1, for the button's name.
  position: number;
  total: number;
  eager: boolean;
  lens: boolean;
  events: GalleryPhotoEvents | undefined;
  buttonRef: (button: HTMLButtonElement | null) => void;
  onOpen: () => void;
}

// One photo as a button that opens the full screen, with the magnifier's lens over it. The lens
// follows the pointer by its own style, with no render per move; its picture is the photo as it
// covers the frame (`object-fit: cover`), so the part under the pointer is the part it enlarges.
function GalleryPhoto({
  image,
  position,
  total,
  eager,
  lens,
  events,
  buttonRef,
  onOpen,
}: GalleryPhotoProps) {
  const lensRef = useRef<HTMLSpanElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  function moveLens(event: PointerEvent<HTMLButtonElement>) {
    const target = lensRef.current;
    if (!target || event.pointerType !== 'mouse') return;
    const frame = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - frame.left;
    const y = event.clientY - frame.top;
    // The photo's drawn size and offset in the frame: covered, centred.
    const naturalWidth = imageRef.current?.naturalWidth || frame.width;
    const naturalHeight = imageRef.current?.naturalHeight || frame.height;
    const scale = Math.max(frame.width / naturalWidth, frame.height / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    const left = (frame.width - width) / 2;
    const top = (frame.height - height) / 2;
    target.style.transform = `translate(${x - LENS / 2}px, ${y - LENS / 2}px)`;
    target.style.backgroundSize = `${width * ZOOM}px ${height * ZOOM}px`;
    target.style.backgroundPosition = `${LENS / 2 - (x - left) * ZOOM}px ${LENS / 2 - (y - top) * ZOOM}px`;
    target.dataset.on = '';
  }

  function hideLens() {
    if (lensRef.current) delete lensRef.current.dataset.on;
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={[styles.open, lens && styles.magnified].filter(Boolean).join(' ')}
        // The name replaces the photo's own, so it carries what the photo shows.
        aria-label={[`Открыть фото ${position} из ${total}`, image.alt].filter(Boolean).join(': ')}
        onClick={(event) => {
          events?.onClick?.(event);
          onOpen();
        }}
        onPointerEnter={(event) => {
          events?.onPointerEnter?.(event);
          if (lens) moveLens(event);
        }}
        onPointerMove={lens ? moveLens : undefined}
        onPointerLeave={(event) => {
          events?.onPointerLeave?.(event);
          hideLens();
        }}
      >
        <Image
          ref={imageRef}
          src={image.src}
          alt={image.alt}
          fill
          sizes="(max-width: 600px) 100vw, (max-width: 1280px) 50vw, 432px"
          loading={eager ? 'eager' : 'lazy'}
          unoptimized
          className={styles.image}
        />
      </button>
      {lens && (
        <span
          ref={lensRef}
          className={styles.lens}
          style={{ backgroundImage: `url(${JSON.stringify(image.src)})` }}
          aria-hidden
        />
      )}
    </>
  );
}
