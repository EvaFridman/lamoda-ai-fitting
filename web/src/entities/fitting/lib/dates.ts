// The fittings' dates as the canvas writes them, in Moscow time: the limit's month is Moscow's
// (spec 0019 A26), and so is every date the boards show.
const ZONE = 'Europe/Moscow';

const dayMonth = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: ZONE,
});
const time = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ZONE,
});

const dayMonthYear = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: ZONE,
});
const day = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: ZONE,
});

// «1 ноября»: when the try-ons come back (`renewsAt`).
export function renewalDate(iso: string): string {
  return dayMonth.format(new Date(iso));
}

// «19 октября, 14:06»: when a result was saved.
export function fittingDate(iso: string): string {
  const date = new Date(iso);
  return `${dayMonth.format(date)}, ${time.format(date)}`;
}

// A history card's date (board 9): «Сегодня, 14:06» for today, else the day, «12 октября», with
// the year when it is not this one («12 октября 2025 г.»).
export function historyDate(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  const today = day.format(now);
  const that = day.format(date);
  if (that === today) return `Сегодня, ${time.format(date)}`;
  return that.slice(0, 4) === today.slice(0, 4) ? dayMonth.format(date) : dayMonthYear.format(date);
}
