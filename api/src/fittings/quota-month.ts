// The month of `fitting_quota` a try-on is counted in (spec 0019 A20): `YYYY-MM` of the calendar
// month in Moscow time (A26). The start transaction reserves the unit in the month of the
// generation's `createdAt` and the workflow's `complete` takes it back from the same one, so a
// try-on that ends after midnight of the month's last day gives its unit back to the month that
// paid it.
const MONTH = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
});

export function quotaMonth(at: Date): string {
  const parts = MONTH.formatToParts(at);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (year === undefined || month === undefined) {
    throw new Error('Intl gave no year or month');
  }
  return `${year}-${month}`;
}

// When the month of `quotaMonth(at)` ends: the first of the next month, midnight in Moscow
// (A26, «снова с 1 ноября»). Moscow keeps UTC+3 all year.
export function quotaRenewsAt(at: Date): Date {
  const [year, month] = quotaMonth(at).split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 1) - 3 * 60 * 60 * 1000);
}
