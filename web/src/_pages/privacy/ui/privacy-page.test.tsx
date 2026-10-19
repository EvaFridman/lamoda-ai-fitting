import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsentBanner } from '@/features/cookie-consent';

import { PrivacyPage } from './privacy-page';

const config = vi.hoisted(() => ({ enabled: true }));

vi.mock('@/shared/config', () => ({
  get analyticsEnabled() {
    return config.enabled;
  },
}));

describe('PrivacyPage', () => {
  beforeEach(() => {
    config.enabled = true;
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders the heading and the placeholder text', () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Политика по работе с персональными данными' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Здесь будет политика по работе с персональными данными\./),
    ).toBeInTheDocument();
  });

  it('says the Google email and name are kept and the photo is not', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/адрес почты и имя из вашего аккаунта Google/)).toBeInTheDocument();
    expect(screen.getByText(/Фотографию профиля мы не храним/)).toBeInTheDocument();
  });

  it('reopens the consent banner with "Настройки cookies" after an answer', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'cookie-consent',
      JSON.stringify({ value: 'denied', at: new Date().toISOString() }),
    );
    render(
      <>
        <ConsentBanner />
        <PrivacyPage />
      </>,
    );
    expect(screen.queryByRole('region', { name: 'Согласие на cookies' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Настройки cookies' }));
    expect(screen.getByRole('region', { name: 'Согласие на cookies' })).toBeInTheDocument();
  });

  it('has no "Настройки cookies" button with an empty token', () => {
    config.enabled = false;
    render(<PrivacyPage />);
    expect(screen.queryByRole('button', { name: 'Настройки cookies' })).not.toBeInTheDocument();
  });
});
