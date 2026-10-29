import { plural } from '@/shared/lib';

// The waiting screen's estimate (spec 0019 A27, board 6): the stages, the percent and the time left
// follow the time since the fitting started against `estimatedSeconds` (the median of the user's
// last results, A70), since the api tells only `queued` or `generating`.

// The canvas's four stages; the first is done once the fitting exists (its photo was checked at
// the upload).
export type FittingStep = 'checked' | 'pose' | 'dressing' | 'details';

export const FITTING_STEPS: readonly FittingStep[] = ['checked', 'pose', 'dressing', 'details'];

// The share of the estimate at which each of the last three stages begins.
const STEP_STARTS: readonly [FittingStep, number][] = [
  ['pose', 0],
  ['dressing', 0.35],
  ['details', 0.75],
];

// The percent stays below 100 until the result is there.
const MAX_PERCENT = 95;

// The estimate before the api names one (it does from the start; null once ended).
const DEFAULT_SECONDS = 25;

export interface FittingProgress {
  step: FittingStep;
  percent: number;
  // Whole seconds, at least 1; 0 once the estimate is past («Почти готово»).
  secondsLeft: number;
}

// `since`: the fitting's `createdAt`, or the click that started it in this window (spec 0024
// AC19: the wait shows before the api answers, and its progress does not restart once it does).
export function fittingProgress(
  since: string | number,
  estimatedSeconds: number | null,
  now: number,
): FittingProgress {
  const total =
    estimatedSeconds !== null && estimatedSeconds > 0 ? estimatedSeconds : DEFAULT_SECONDS;
  const origin = typeof since === 'number' ? since : Date.parse(since);
  const elapsed = Math.max(0, (now - origin) / 1000);
  const share = elapsed / total;
  let step: FittingStep = 'pose';
  for (const [candidate, start] of STEP_STARTS) if (share >= start) step = candidate;
  const left = total - elapsed;
  return {
    step,
    percent: Math.min(MAX_PERCENT, Math.floor(share * 100)),
    secondsLeft: left <= 0 ? 0 : Math.max(1, Math.round(left)),
  };
}

// The origin that keeps a wait's share of its estimate when the estimate changes: a start shown
// from the click counts on the default until the api names the real one, and its progress goes on
// from where it was, never back (spec 0024 AC19).
export function keptOrigin(
  origin: number,
  before: number | null,
  after: number | null,
  now: number,
): number {
  const total = (seconds: number | null) =>
    seconds !== null && seconds > 0 ? seconds : DEFAULT_SECONDS;
  return now - ((now - origin) * total(after)) / total(before);
}

const SECONDS = ['секунду', 'секунды', 'секунд'] as const;

// «Осталось около 10 секунд», «Почти готово» once the estimate is past.
export function timeLeftText(secondsLeft: number): string {
  if (secondsLeft <= 0) return 'Почти готово';
  return `Осталось около ${secondsLeft} ${plural(secondsLeft, SECONDS)}`;
}
