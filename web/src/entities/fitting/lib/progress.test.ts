import { describe, expect, it } from 'vitest';

import { fittingProgress, keptOrigin, timeLeftText } from './progress';

describe('timeLeftText', () => {
  it.each([
    [0, 'Почти готово'],
    [-3, 'Почти готово'],
    [1, 'Осталось около 1 секунду'],
    [2, 'Осталось около 2 секунды'],
    [5, 'Осталось около 5 секунд'],
    [11, 'Осталось около 11 секунд'],
    [21, 'Осталось около 21 секунду'],
  ])('%i seconds read «%s»', (seconds, text) => {
    expect(timeLeftText(seconds)).toBe(text);
  });
});

const START = '2026-10-20T12:00:00.000Z';
const at = (seconds: number) => Date.parse(START) + seconds * 1000;

describe('keptOrigin', () => {
  it('keeps the share of the estimate when the estimate changes', () => {
    const now = at(10);
    const origin = keptOrigin(at(0), null, 20, now);

    expect(fittingProgress(origin, 20, now).percent).toBe(
      fittingProgress(at(0), null, now).percent,
    );
    expect(fittingProgress(origin, 20, now).percent).toBe(40);
  });

  it('reads a null or zero estimate as 25 seconds on either side', () => {
    expect(keptOrigin(at(0), 0, null, at(10))).toBe(at(0));
    expect(keptOrigin(at(0), null, 50, at(10))).toBe(at(-10));
    expect(keptOrigin(at(0), 50, 0, at(10))).toBe(at(5));
  });

  it('leaves the origin unchanged for equal estimates', () => {
    expect(keptOrigin(at(3), 20, 20, at(10))).toBe(at(3));
  });

  it('never moves the origin past now', () => {
    expect(keptOrigin(at(10), null, 20, at(10))).toBe(at(10));
  });
});

describe('fittingProgress', () => {
  it('starts at the pose stage with zero percent and the whole estimate left', () => {
    expect(fittingProgress(START, 20, at(0))).toEqual({
      step: 'pose',
      percent: 0,
      secondsLeft: 20,
    });
  });

  it('moves to dressing at 35 % of the estimate', () => {
    expect(fittingProgress(START, 100, at(34)).step).toBe('pose');
    expect(fittingProgress(START, 100, at(35)).step).toBe('dressing');
  });

  it('moves to details at 75 % of the estimate', () => {
    expect(fittingProgress(START, 100, at(74)).step).toBe('dressing');
    expect(fittingProgress(START, 100, at(75)).step).toBe('details');
  });

  it('rounds the percent down', () => {
    expect(fittingProgress(START, 30, at(10)).percent).toBe(33);
  });

  it('never shows more than 95 percent', () => {
    expect(fittingProgress(START, 20, at(19.9)).percent).toBe(95);
    expect(fittingProgress(START, 20, at(500)).percent).toBe(95);
  });

  it('shows at least one second left until the estimate is past', () => {
    expect(fittingProgress(START, 20, at(19.9)).secondsLeft).toBe(1);
    expect(fittingProgress(START, 20, at(15)).secondsLeft).toBe(5);
  });

  it('shows no time left once the estimate is past and stays in the last stage', () => {
    expect(fittingProgress(START, 20, at(20))).toMatchObject({ step: 'details', secondsLeft: 0 });
    expect(fittingProgress(START, 20, at(90))).toMatchObject({ step: 'details', secondsLeft: 0 });
  });

  it('counts from 25 seconds when the api names no estimate', () => {
    expect(fittingProgress(START, null, at(0)).secondsLeft).toBe(25);
    expect(fittingProgress(START, 0, at(5)).secondsLeft).toBe(20);
  });

  it('takes a click time in milliseconds as the origin, like the same time as a string (AC19)', () => {
    for (const seconds of [0, 8, 20, 90]) {
      expect(fittingProgress(at(0), 20, at(seconds))).toEqual(
        fittingProgress(START, 20, at(seconds)),
      );
    }
    expect(fittingProgress(at(0), 100, at(35))).toMatchObject({ step: 'dressing', percent: 35 });
  });

  it('counts a numeric origin from the default estimate when the api names none', () => {
    expect(fittingProgress(at(0), null, at(5)).secondsLeft).toBe(20);
  });

  it('treats a clock behind a numeric origin as no time passed', () => {
    expect(fittingProgress(at(0), 20, at(-5))).toEqual({
      step: 'pose',
      percent: 0,
      secondsLeft: 20,
    });
  });

  it('treats a clock behind the start as no time passed', () => {
    expect(fittingProgress(START, 20, at(-5))).toEqual({
      step: 'pose',
      percent: 0,
      secondsLeft: 20,
    });
  });
});
