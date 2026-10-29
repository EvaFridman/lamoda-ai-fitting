import type { SavePhotoSwitchProps } from '@/features/upload-photo';

// What a result's save switch takes from the window: whether the photo is one of its one-time
// uploads, whether the switch was turned off for it on an earlier result, and the keep and unkeep
// that move it out of and back into them (spec 0024 plan §4.2).
export type ResultPhotoProps = Pick<
  SavePhotoSwitchProps,
  'uploadedHere' | 'declined' | 'onKept' | 'onUnkept' | 'onKeeping'
>;
