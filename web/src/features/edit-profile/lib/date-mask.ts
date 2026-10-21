// The date of birth's field, `ДД.ММ.ГГГГ` (spec 0017 U9, plan §5). The browser checks only that a
// full value is a real date; the range (from 1900-01-01, at least 14 years ago) is the api's.

const DIGITS = 8;

const ISO_DATE = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/;

// What was typed, as the field shows it: only digits are kept, at most eight, and the dots are put
// in after the day and the month once a digit follows them. A pasted `YYYY-MM-DD` is turned around
// first, or its digits would read as `ГГ.ГГ.ММДД`.
export function maskDate(input: string): string {
  const iso = ISO_DATE.exec(input);
  const ordered = iso ? `${iso[3]}${iso[2]}${iso[1]}` : input;
  const digits = ordered.replace(/\D/g, '').slice(0, DIGITS);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)];
  return parts.filter(Boolean).join('.');
}

// Where the caret goes in a masked value: right after its `digits`-th digit, so an edit in the
// middle keeps its place when the mask moves the dots.
export function caretAfterDigits(masked: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < masked.length; index += 1) {
    if (/\d/.test(masked.charAt(index))) seen += 1;
    if (seen === digits) return index + 1;
  }
  return masked.length;
}

// The saved `YYYY-MM-DD` as the field shows it; an empty field for none.
export function maskedFromIso(iso: string | null): string {
  if (iso === null) return '';
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

export type MaskedDate =
  | { status: 'empty' }
  | { status: 'incomplete' }
  | { status: 'invalid' }
  | { status: 'valid'; iso: string };

// A masked value read back: empty, not all eight digits yet, a date that does not exist (31.02, a
// year 0000) or the date as `YYYY-MM-DD`.
export function parseMaskedDate(masked: string): MaskedDate {
  const digits = masked.replace(/\D/g, '');
  if (digits === '') return { status: 'empty' };
  if (digits.length < DIGITS) return { status: 'incomplete' };

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  // setUTCFullYear, not Date.UTC: Date.UTC reads a year below 100 as 19xx.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  const real =
    year >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!real) return { status: 'invalid' };
  return { status: 'valid', iso: `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}` };
}
