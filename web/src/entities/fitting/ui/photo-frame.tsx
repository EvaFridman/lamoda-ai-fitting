import type { ReactNode } from 'react';

import styles from './photo-frame.module.scss';

export interface PhotoFrameProps {
  // The photo (an image with `fill`) and whatever lies over it: a plate, a spinner, a progress.
  children?: ReactNode;
  className?: string;
}

// The try-on's one photo frame (spec 0023 P24, Y15): the picker's photo, an upload, the wait and
// the result show in a 2:3 box (the result's 1024×1536) whose size follows the window only, so it
// never jumps between the steps; every image in it is contained on the light grey, so any photo
// shows whole. The photos are personal data: the frame is `mp-block` (A37).
export function PhotoFrame({ children, className }: PhotoFrameProps) {
  return (
    <div className={['mp-block', styles.frame, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
