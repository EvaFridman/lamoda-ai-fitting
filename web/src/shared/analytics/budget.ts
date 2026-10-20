import type { Catalog } from './catalog';

/** Events a month on Mixpanel's free plan (spec 0008 J4). */
export const MONTHLY_LIMIT = 1_000_000;
/** The share of `MONTHLY_LIMIT` the estimates may reach (spec 0015 R15). */
export const BUDGET_THRESHOLD = 0.8;

export type BudgetPart = { perVisit: number; perMonth: number };

/** The catalog's estimated volume by part, and their sum (R15). */
export type MonthlyEstimate = {
  events: BudgetPart;
  clicks: BudgetPart;
  hovers: BudgetPart;
  sdk: BudgetPart;
  total: BudgetPart;
};

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

export function estimateMonthly(catalog: Catalog): MonthlyEstimate {
  const elements = Object.values(catalog.elements);
  const part = (perVisit: number): BudgetPart => ({
    perVisit,
    perMonth: perVisit * catalog.visitsPerMonth,
  });
  const events = part(sum(Object.values(catalog.events).map((event) => event.perVisit)));
  const clicks = part(sum(elements.map((element) => element.clicksPerVisit)));
  const hovers = part(sum(elements.map((element) => element.hoversPerVisit)));
  const sdk = part(catalog.sdkPerVisit);
  const total = part(events.perVisit + clicks.perVisit + hovers.perVisit + sdk.perVisit);
  return { events, clicks, hovers, sdk, total };
}
