import Image from 'next/image';
import type { ReactNode } from 'react';

import styles from './try-on-loader.module.scss';

export interface TryOnLoaderProps {
  // The photo being tried on (a signed link; personal data, A37), or null: a grey frame.
  photoUrl: string | null;
  // Over the loader: board 7.2's progress while a colour is tried on.
  children?: ReactNode;
  className?: string;
}

// Board 6's TryOnLoader: the user's photo blurred, with white dots sweeping across it (the brand's
// animation, still under `prefers-reduced-motion`). The photo is only an image's `src`, lazy, in an
// `mp-block` container (A37).
export function TryOnLoader({ photoUrl, children, className }: TryOnLoaderProps) {
  return (
    <div className={['mp-block', styles.loader, className].filter(Boolean).join(' ')}>
      {photoUrl && (
        <Image className={styles.photo} src={photoUrl} alt="" fill sizes="480px" unoptimized />
      )}
      <span className={styles.dots} aria-hidden />
      {children}
    </div>
  );
}
