import { useEffect, useRef } from 'react';

import { CloseIcon } from '@/shared/ui';

import styles from './refused-preview.module.scss';

export interface RefusedPreviewProps {
  // The file the check refused, still only in this browser.
  file: File;
  // A photo that looks like a child's is not shown again: «Фото скрыто» in its place.
  hidden: boolean;
}

// Board 5's picture of the refused photo (spec 0019 A63.8), from the chosen file: an object URL
// made while the preview is shown and revoked when it goes. The photo is personal data (A37): the
// link is only the image's `src`, and the frame carries `mp-block`, so recordings leave it out.
export function RefusedPreview({ file, hidden }: RefusedPreviewProps) {
  const imageRef = useRef<HTMLImageElement>(null);

  // The link is put on the image here, not rendered: it lives only while the image is shown.
  useEffect(() => {
    const image = imageRef.current;
    if (hidden || !image) return;
    const objectUrl = URL.createObjectURL(file);
    image.src = objectUrl;
    return () => {
      image.removeAttribute('src');
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, hidden]);

  if (hidden) {
    return (
      <div className={[styles.frame, styles.hidden].join(' ')}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden focusable={false}>
          <rect x="3" y="4" width="18" height="16" stroke="currentColor" />
          <path d="M3 4l18 16" stroke="currentColor" />
        </svg>
        <span>Фото скрыто</span>
      </div>
    );
  }

  return (
    <div className={['mp-block', styles.frame].join(' ')}>
      {/* A local object URL: Next's image component would add nothing to it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imageRef} className={styles.image} alt="Загруженное фото" />
      <span className={styles.mark} aria-hidden>
        <CloseIcon size={16} />
      </span>
    </div>
  );
}
