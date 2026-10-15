import { act, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startAnalytics, stopAnalytics, track, useTrackedElement } from '@/shared/analytics';

import { answerConsent, CONSENT_KEY, reopenConsent } from '../model/consent-store';

import { AnalyticsGate } from './analytics-gate';

const HOVER_MS = 500;
const pathname = vi.hoisted(() => ({ current: '/a' }));

vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));
vi.mock('@/shared/analytics/client', () => ({
  track: vi.fn(),
  startAnalytics: vi.fn(),
  stopAnalytics: vi.fn(),
}));

function Probe() {
  const props = useTrackedElement('ui-kit.button-primary');
  return (
    <button type="button" {...props}>
      probe
    </button>
  );
}

function Page({ show }: { show: boolean }) {
  return (
    <>
      <AnalyticsGate />
      {show ? <Probe /> : null}
    </>
  );
}

function resetStore() {
  answerConsent('denied');
  window.localStorage.clear();
}

let testNumber = 0;

describe('AnalyticsGate', () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(startAnalytics).mockClear();
    vi.mocked(stopAnalytics).mockClear();
    vi.mocked(track).mockClear();
    testNumber += 1;
    pathname.current = `/gate-${testNumber}`;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetStore();
  });

  it('stops analytics (clearing leftovers) when there is no answer or a denied one', () => {
    render(<AnalyticsGate />);
    expect(stopAnalytics).toHaveBeenCalledTimes(1);
    act(() => answerConsent('denied'));
    expect(stopAnalytics).toHaveBeenCalledTimes(2);
  });

  it('never stops analytics when mounted with a stored granted answer', () => {
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ value: 'granted', at: new Date().toISOString() }),
    );
    render(<AnalyticsGate />);
    expect(stopAnalytics).not.toHaveBeenCalled();
  });

  it('never stops analytics while hydrating, then starts for a stored granted answer', () => {
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ value: 'granted', at: new Date().toISOString() }),
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(<AnalyticsGate />);
    let root: Root | undefined;
    act(() => {
      root = hydrateRoot(container, <AnalyticsGate />);
    });
    expect(stopAnalytics).not.toHaveBeenCalled();
    expect(startAnalytics).toHaveBeenCalledTimes(1);
    act(() => root?.unmount());
  });

  it('never starts analytics with no answer', () => {
    render(<AnalyticsGate />);
    expect(startAnalytics).not.toHaveBeenCalled();
  });

  it('starts analytics when a stored answer is granted', () => {
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ value: 'granted', at: new Date().toISOString() }),
    );
    render(<AnalyticsGate />);
    expect(startAnalytics).toHaveBeenCalledTimes(1);
  });

  it('starts on a granted answer and stops when it changes to denied', () => {
    render(<AnalyticsGate />);
    act(() => answerConsent('granted'));
    expect(startAnalytics).toHaveBeenCalledTimes(1);
    vi.mocked(stopAnalytics).mockClear();
    act(() => answerConsent('denied'));
    expect(stopAnalytics).toHaveBeenCalledTimes(1);
    expect(startAnalytics).toHaveBeenCalledTimes(1);
  });

  it('does not start for a denied answer', () => {
    render(<AnalyticsGate />);
    act(() => answerConsent('denied'));
    expect(startAnalytics).not.toHaveBeenCalled();
  });

  it('does not stop analytics while the banner is reopened with a granted answer', () => {
    render(<AnalyticsGate />);
    act(() => answerConsent('granted'));
    vi.mocked(stopAnalytics).mockClear();
    act(() => reopenConsent());
    expect(stopAnalytics).not.toHaveBeenCalled();
  });

  it('never starts when storage refuses the answer', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<AnalyticsGate />);
    expect(() => act(() => answerConsent('granted'))).not.toThrow();
    expect(startAnalytics).not.toHaveBeenCalled();
  });

  it('stops when a decline cannot be stored after a granted answer', () => {
    render(<AnalyticsGate />);
    act(() => answerConsent('granted'));
    vi.mocked(stopAnalytics).mockClear();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    act(() => answerConsent('denied'));
    expect(stopAnalytics).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  it('starts when another tab grants (storage event)', () => {
    render(<AnalyticsGate />);
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ value: 'granted', at: new Date().toISOString() }),
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_KEY }));
    });
    expect(startAnalytics).toHaveBeenCalledTimes(1);
  });

  it('starts a new page view for hovers on a path change', () => {
    vi.useFakeTimers();
    const a = pathname.current;
    const { rerender } = render(<Page show />);
    fireEvent.pointerEnter(screen.getByRole('button'), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledTimes(1);

    pathname.current = `${a}/b`;
    rerender(<Page show={false} />);
    pathname.current = a;
    rerender(<Page show />);
    fireEvent.pointerEnter(screen.getByRole('button'), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledTimes(2);
  });
});
