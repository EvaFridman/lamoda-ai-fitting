import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { answerConsent, CONSENT_KEY } from '../model/consent-store';

import { ConsentBanner } from './consent-banner';
import { CookieSettingsButton } from './cookie-settings-button';

const config = vi.hoisted(() => ({ enabled: true }));

vi.mock('@/shared/config', () => ({
  get analyticsEnabled() {
    return config.enabled;
  },
}));

function resetStore() {
  answerConsent('denied');
  window.localStorage.clear();
}

describe('ConsentBanner', () => {
  beforeEach(() => {
    config.enabled = true;
    resetStore();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetStore();
  });

  it('asks when there is no answer, with the text, the policy link and two buttons', () => {
    render(<ConsentBanner />);
    const region = screen.getByRole('region', { name: 'Согласие на cookies' });
    expect(region).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Политика по работе с персональными данными' }),
    ).toHaveAttribute('href', '/privacy');
    const accept = screen.getByRole('button', { name: 'Принять' });
    const decline = screen.getByRole('button', { name: 'Отказаться' });
    expect(accept.className).toBe(decline.className);
  });

  it('stores "granted" with the current time and hides on "Принять"', async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);
    const before = Date.now();
    await user.click(screen.getByRole('button', { name: 'Принять' }));
    const saved = JSON.parse(window.localStorage.getItem(CONSENT_KEY)!);
    expect(saved.value).toBe('granted');
    expect(Date.parse(saved.at)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(saved.at)).toBeLessThanOrEqual(Date.now());
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('stores "denied" and hides on "Отказаться"', async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);
    await user.click(screen.getByRole('button', { name: 'Отказаться' }));
    expect(JSON.parse(window.localStorage.getItem(CONSENT_KEY)!).value).toBe('denied');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('stays hidden with a fresh stored answer', () => {
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ value: 'granted', at: new Date().toISOString() }),
    );
    render(<ConsentBanner />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('asks again when the stored answer is 366 days old', () => {
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        value: 'granted',
        at: new Date(Date.now() - 366 * 86_400_000).toISOString(),
      }),
    );
    render(<ConsentBanner />);
    expect(screen.getByRole('region', { name: 'Согласие на cookies' })).toBeInTheDocument();
  });

  it('renders nothing on the server, even with no answer', () => {
    expect(renderToString(<ConsentBanner />)).toBe('');
  });

  it('is not shown with an empty token', () => {
    config.enabled = false;
    render(<ConsentBanner />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('hides for the page and does not throw when storage refuses the answer', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<ConsentBanner />);
    expect(screen.getByRole('region')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Принять' }));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('disappears when another tab answers (storage event)', () => {
    render(<ConsentBanner />);
    expect(screen.getByRole('region')).toBeInTheDocument();
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ value: 'granted', at: new Date().toISOString() }),
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_KEY }));
    });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('ignores a storage event for another key', () => {
    render(<ConsentBanner />);
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ value: 'granted', at: new Date().toISOString() }),
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    });
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  describe('with CookieSettingsButton', () => {
    it('shows the banner again, and a new answer replaces the stored one', async () => {
      const user = userEvent.setup();
      answerConsent('granted');
      render(
        <>
          <CookieSettingsButton />
          <ConsentBanner />
        </>,
      );
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Настройки cookies' }));
      expect(screen.getByRole('region')).toBeInTheDocument();
      expect(JSON.parse(window.localStorage.getItem(CONSENT_KEY)!).value).toBe('granted');
      await user.click(screen.getByRole('button', { name: 'Отказаться' }));
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
      expect(JSON.parse(window.localStorage.getItem(CONSENT_KEY)!).value).toBe('denied');
    });

    it('moves focus to the banner region on reopen and back to the settings button on an answer', async () => {
      const user = userEvent.setup();
      answerConsent('granted');
      render(
        <>
          <CookieSettingsButton />
          <ConsentBanner />
        </>,
      );
      await user.click(screen.getByRole('button', { name: 'Настройки cookies' }));
      expect(screen.getByRole('region', { name: 'Согласие на cookies' })).toHaveFocus();
      await user.keyboard('{Tab}{Tab}{Tab}');
      expect(screen.getByRole('button', { name: 'Отказаться' })).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Настройки cookies' })).toHaveFocus();
    });

    it('does not answer when Enter is pressed right after a reopen', async () => {
      const user = userEvent.setup();
      answerConsent('granted');
      render(
        <>
          <CookieSettingsButton />
          <ConsentBanner />
        </>,
      );
      await user.click(screen.getByRole('button', { name: 'Настройки cookies' }));
      await user.keyboard('{Enter}');
      expect(screen.getByRole('region')).toHaveFocus();
      expect(JSON.parse(window.localStorage.getItem(CONSENT_KEY)!).value).toBe('granted');
    });

    it('moves focus into the region when settings is clicked while the banner is already shown', async () => {
      const user = userEvent.setup();
      render(
        <>
          <CookieSettingsButton />
          <ConsentBanner />
        </>,
      );
      const settings = screen.getByRole('button', { name: 'Настройки cookies' });
      await user.click(settings);
      expect(screen.getByRole('region')).toHaveFocus();
      expect(window.localStorage.getItem(CONSENT_KEY)).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Принять' }));
      expect(settings).toHaveFocus();
    });

    it('does not steal focus on the first show', () => {
      render(
        <>
          <CookieSettingsButton />
          <ConsentBanner />
        </>,
      );
      expect(screen.getByRole('region')).toBeInTheDocument();
      expect(document.body).toHaveFocus();
    });

    it('is not rendered with an empty token', () => {
      config.enabled = false;
      render(<CookieSettingsButton />);
      expect(screen.queryByRole('button', { name: 'Настройки cookies' })).not.toBeInTheDocument();
    });
  });
});
