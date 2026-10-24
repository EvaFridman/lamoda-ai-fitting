import { describe, expect, it } from 'vitest';

import { isFittingShown, showFitting } from './shown';

describe('showFitting', () => {
  it('marks a fitting shown until the returned function is called', () => {
    const hide = showFitting('shown-1');
    expect(isFittingShown('shown-1')).toBe(true);
    hide();
    expect(isFittingShown('shown-1')).toBe(false);
  });

  it('keeps a fitting shown while another window still shows it', () => {
    const first = showFitting('shown-2');
    const second = showFitting('shown-2');
    first();
    expect(isFittingShown('shown-2')).toBe(true);
    second();
    expect(isFittingShown('shown-2')).toBe(false);
  });

  it('knows nothing of another fitting', () => {
    const hide = showFitting('shown-3');
    expect(isFittingShown('shown-other')).toBe(false);
    hide();
  });
});
