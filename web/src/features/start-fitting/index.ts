// Public API of the slice: other layers import only from here.
export { FittingErrorCard, type FittingErrorCardProps } from './ui/fitting-error-card';
export { FittingSuccess, type FittingSuccessProps } from './ui/fitting-success';
export { FittingWait, type FittingWaitProps } from './ui/fitting-wait';
export { LimitCard, type LimitCardProps } from './ui/limit-card';
export type { PendingFitting } from './model/pending';
export {
  StartFittingButton,
  type StartFittingButtonProps,
  StartLookButton,
  type StartLookButtonProps,
} from './ui/start-fitting-button';
export { TryOnLoader, type TryOnLoaderProps } from './ui/try-on-loader';
