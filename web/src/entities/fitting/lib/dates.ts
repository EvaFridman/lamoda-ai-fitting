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

// «1 ноября»: when the try-ons come back (`renewsAt`).
export function renewalDate(iso: string): string {
  return dayMonth.format(new Date(iso));
}

// «19 октября, 14:06»: when a result was saved.
export function fittingDate(iso: string): string {
  const date = new Date(iso);
  return `${dayMonth.format(date)}, ${time.format(date)}`;
}
