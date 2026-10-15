import { describe, expect, it, vi } from 'vitest';

import { track } from './client';
import type { AnalyticsEventName, AnalyticsEvents } from './events';

vi.mock('./client', () => ({ track: vi.fn() }));

// The assertions are for the type checker (`npm run typecheck`, spec 0008 AC9): an unused
// `@ts-expect-error` fails it.
describe('analytics event types', () => {
  it('accepts the listed events', () => {
    track('Element Clicked', { element: 'ui-kit.button-primary' });
    track('Element Hovered', { element: 'ui-kit.button-primary' });
    const names: AnalyticsEventName[] = ['Element Clicked', 'Element Hovered'];
    const props: AnalyticsEvents['Element Clicked'] = { element: 'ui-kit.button-primary' };
    expect(names).toHaveLength(2);
    expect(props.element).toBe('ui-kit.button-primary');
  });

  it('rejects anything else at compile time', () => {
    // @ts-expect-error unknown event name
    track('Unknown Event', { element: 'ui-kit.button-primary' });
    // @ts-expect-error unknown element
    track('Element Clicked', { element: 'nowhere' });
    // @ts-expect-error missing property
    track('Element Clicked', {});
    // @ts-expect-error extra property
    track('Element Clicked', { element: 'ui-kit.button-primary', extra: 1 });
    expect(track).toHaveBeenCalledWith('Element Clicked', {});
  });
});
