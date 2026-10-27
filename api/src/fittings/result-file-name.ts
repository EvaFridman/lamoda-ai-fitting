// The name a downloaded result is saved under (spec 0023 plan §3.2): `primerka-YYYY-MM-DD-HHmm.webp`
// of the moment it was made, in Moscow time (A26).
const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function resultFileName(at: Date): string {
  const parts = Object.fromEntries(
    PARTS.formatToParts(at).map(({ type, value }) => [type, value]),
  ) as Partial<Record<Intl.DateTimeFormatPartTypes, string>>;
  const { year, month, day, hour, minute } = parts;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new Error('Intl gave no date or time');
  }
  return `primerka-${year}-${month}-${day}-${hour}${minute}.webp`;
}
