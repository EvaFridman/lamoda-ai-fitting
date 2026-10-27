import Image from 'next/image';
import type { ReactNode } from 'react';

import { PhotoFrame } from '@/entities/fitting';

import styles from './try-on-loader.module.scss';

export interface TryOnLoaderProps {
  // The photo being tried on (a signed link; personal data, A37), or null: a grey frame.
  photoUrl: string | null;
  // Over the loader: board 7.2's progress while a colour is tried on.
  children?: ReactNode;
}

// Board 6's TryOnLoader: the user's photo blurred, with white dots sweeping across it (the brand's
// animation, still under `prefers-reduced-motion`), in the try-on's one frame (spec 0023 P24), the
// photo whole under the blur. The photo is only an image's `src`, lazy (A37).
export function TryOnLoader({ photoUrl, children }: TryOnLoaderProps) {
  return (
    <PhotoFrame>
      {photoUrl && (
        <Image className={styles.photo} src={photoUrl} alt="" fill sizes="480px" unoptimized />
      )}
      <span className={styles.dots} aria-hidden />
      {children}
    </PhotoFrame>
  );
}
