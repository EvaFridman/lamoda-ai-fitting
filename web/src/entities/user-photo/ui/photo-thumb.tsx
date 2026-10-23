import Image from 'next/image';
import type { ReactNode } from 'react';

import type { UserPhoto } from '../model/schemas';

import styles from './photo-thumb.module.scss';

export interface PhotoThumbProps {
  photo: Pick<UserPhoto, 'url' | 'isDefault' | 'width' | 'height'>;
  // The image's text alternative, built by the page from its place ("Фото 2"): never from the
  // photo's data, since recordings keep attributes (spec 0008).
  alt: string;
  // The page's actions over the photo (make it the default, delete), with their own handlers.
  children?: ReactNode;
  // `false` leaves the mark "По умолчанию" to the page, beside a small thumbnail (board 10's rows).
  showDefault?: boolean;
  className?: string;
}

// A saved photo at 3:4, cut to fill the frame, with the mark "По умолчанию" on the default one. The
// photo is personal data (spec 0019 A37): the signed link is only the image's `src`, lazy and
// never preloaded (no `priority`), and the container carries `mp-block`, so recordings leave it out. A photo
// whose link the api could not sign (`url: null`) shows an empty frame.
export function PhotoThumb({
  photo,
  alt,
  children,
  showDefault = true,
  className,
}: PhotoThumbProps) {
  return (
    <figure className={['mp-block', styles.thumb, className].filter(Boolean).join(' ')}>
      {photo.url ? (
        // `unoptimized`: Next's optimizer would fetch the signed link itself.
        <Image
          className={styles.image}
          src={photo.url}
          alt={alt}
          width={photo.width}
          height={photo.height}
          unoptimized
        />
      ) : (
        <span className={styles.empty} role="img" aria-label={alt} />
      )}
      {showDefault && photo.isDefault ? (
        <figcaption className={styles.default}>По умолчанию</figcaption>
      ) : null}
      {children}
    </figure>
  );
}
