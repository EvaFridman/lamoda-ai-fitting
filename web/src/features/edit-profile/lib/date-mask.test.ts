import { describe, expect, it } from 'vitest';

import { caretAfterDigits, maskDate, maskedFromIso, parseMaskedDate } from './date-mask';

describe('caretAfterDigits', () => {
  it('is 0 for no digits before the caret', () => {
    expect(caretAfterDigits('12.05', 0)).toBe(0);
    expect(caretAfterDigits('12.05', -1)).toBe(0);
  });

  it('puts the caret right after the n-th digit', () => {
    expect(caretAfterDigits('12.05.1990', 1)).toBe(1);
    expect(caretAfterDigits('12.05.1990', 2)).toBe(2);
    expect(caretAfterDigits('12.05.1990', 3)).toBe(4);
    expect(caretAfterDigits('12.05.1990', 4)).toBe(5);
    expect(caretAfterDigits('12.05.1990', 5)).toBe(7);
    expect(caretAfterDigits('12.05.1990', 8)).toBe(10);
  });

  it('is the end when there are fewer digits than asked', () => {
    expect(caretAfterDigits('12.0', 5)).toBe(4);
    expect(caretAfterDigits('', 3)).toBe(0);
  });
});

describe('maskDate', () => {
  it.each([
    ['', ''],
    ['1', '1'],
    ['12', '12'],
    ['120', '12.0'],
    ['1205', '12.05'],
    ['12051', '12.05.1'],
    ['12051990', '12.05.1990'],
  ])('shows %j as %j, the dots only once a digit follows', (input, expected) => {
    expect(maskDate(input)).toBe(expected);
  });

  it('keeps only digits', () => {
    expect(maskDate('a1b2-c0/5 x')).toBe('12.05');
  });

  it('keeps at most eight digits', () => {
    expect(maskDate('1205199077')).toBe('12.05.1990');
  });

  it('takes a pasted masked value as it is', () => {
    expect(maskDate('12.05.1990')).toBe('12.05.1990');
  });

  it('turns a pasted ISO date around', () => {
    expect(maskDate('1990-05-12')).toBe('12.05.1990');
    expect(maskDate('  1990-05-12 ')).toBe('12.05.1990');
  });

  it('does not special-case an ISO-like string with other separators', () => {
    expect(maskDate('1990/05/12')).toBe('19.90.0512');
    expect(maskDate('1990.05.12')).toBe('19.90.0512');
  });

  it('shows the value again when a dot is deleted from the end', () => {
    expect(maskDate('12.')).toBe('12');
    expect(maskDate('12.05.')).toBe('12.05');
  });

  it('shows the shorter value when the last digit is deleted', () => {
    expect(maskDate('12.05.199')).toBe('12.05.199');
    expect(maskDate('12.0')).toBe('12.0');
  });
});

describe('maskedFromIso', () => {
  it('is an empty field for none', () => {
    expect(maskedFromIso(null)).toBe('');
  });

  it('turns YYYY-MM-DD into DD.MM.YYYY', () => {
    expect(maskedFromIso('1990-05-12')).toBe('12.05.1990');
  });

  it('round-trips through parseMaskedDate', () => {
    expect(parseMaskedDate(maskedFromIso('2000-02-29'))).toEqual({
      status: 'valid',
      iso: '2000-02-29',
    });
  });

  it('is unchanged by maskDate', () => {
    const masked = maskedFromIso('1990-05-12');
    expect(maskDate(masked)).toBe(masked);
  });
});

describe('parseMaskedDate', () => {
  it('is empty for an empty field or one with no digits', () => {
    expect(parseMaskedDate('')).toEqual({ status: 'empty' });
    expect(parseMaskedDate('..')).toEqual({ status: 'empty' });
  });

  it.each(['1', '12.0', '12.05.199'])('is incomplete for %j', (masked) => {
    expect(parseMaskedDate(masked)).toEqual({ status: 'incomplete' });
  });

  it.each([
    '31.02.2001',
    '29.02.2001',
    '00.01.2000',
    '01.13.2000',
    '01.00.2000',
    '32.01.2000',
    '01.01.0000',
  ])('is invalid for %j', (masked) => {
    expect(parseMaskedDate(masked)).toEqual({ status: 'invalid' });
  });

  it('is valid for a real date, as YYYY-MM-DD', () => {
    expect(parseMaskedDate('12.05.1990')).toEqual({ status: 'valid', iso: '1990-05-12' });
  });

  it('accepts 29 February of a leap year', () => {
    expect(parseMaskedDate('29.02.2000')).toEqual({ status: 'valid', iso: '2000-02-29' });
  });

  it('refuses 29 February of 1900, not a leap year', () => {
    expect(parseMaskedDate('29.02.1900')).toEqual({ status: 'invalid' });
  });

  it("keeps a year below 100 as written; the range is the api's", () => {
    expect(parseMaskedDate('01.01.0050')).toEqual({ status: 'valid', iso: '0050-01-01' });
  });
});
