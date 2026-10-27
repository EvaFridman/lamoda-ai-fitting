import type { ReactNode, Ref } from 'react';

import styles from './photo-frame.module.scss';

export interface PhotoFrameProps {
  // The photo (an image with `fill`) and whatever lies over it: a plate, a spinner, a progress.
  children?: ReactNode;
  className?: string;
  // The element «Во весь экран» opens (spec 0023 P29).
  ref?: Ref<HTMLDivElement>;
}

// The try-on's one photo frame (spec 0023 P24, Y15): the picker's photo, an upload, the wait and
// the result show in a 2:3 box (the result's 1024×1536) whose size follows the window only, so it
// never jumps between the steps; every image in it is contained on the light grey, so any photo
// shows whole. Full screen it is the whole screen on black, the picture still whole. The photos are
// personal data: the frame is `mp-block` (A37).
export function PhotoFrame({ children, className, ref }: PhotoFrameProps) {
  return (
    <div ref={ref} className={['mp-block', styles.frame, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
