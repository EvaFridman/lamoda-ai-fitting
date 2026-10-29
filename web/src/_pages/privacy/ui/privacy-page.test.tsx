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

  it('says fitting photos go to OpenAI, are not used for training and can be deleted', () => {
    render(<PrivacyPage />);
    const paragraph = screen.getByText(/Для онлайн-примерки вы загружаете своё фото/);
    expect(paragraph).toHaveTextContent('передаётся в OpenAI (США)');
    expect(paragraph).toHaveTextContent('для обучения моделей фото не используются');
    expect(paragraph).toHaveTextContent('при удалении аккаунта удаляются все фото');
  });

  it('says the stores map is Yandex: it gets the device address and may keep its cookies (AC14)', () => {
    render(<PrivacyPage />);
    const paragraph = screen.getByText(/На странице магазинов показана карта Яндекса/);
    expect(paragraph).toHaveTextContent('Яндекс получает адрес вашего устройства');
    expect(paragraph).toHaveTextContent('может сохранять свои cookie');
  });

  it('says the location is asked for, stays in the browser, right after the map paragraph (AC13)', () => {
    render(<PrivacyPage />);
    const map = screen.getByText(/На странице магазинов показана карта Яндекса/);
    const location = screen.getByText(/сайт просит у браузера ваше местоположение/);
    expect(location.textContent?.trim()).toBe(
      'На странице магазинов и по кнопке «Определить автоматически» сайт просит у браузера ваше местоположение. Оно используется только в браузере, чтобы выбрать ближайший город с магазином Lamoda Sport, и никуда не передаётся. Выбранный город хранится в вашем браузере.',
    );
    expect(map.nextElementSibling).toBe(location);
  });

  it('links the Yandex Maps terms in a new tab without opener or referrer', () => {
    render(<PrivacyPage />);
    const link = screen.getByRole('link', { name: 'условия использования API Яндекс Карт' });
    expect(link).toHaveAttribute('href', 'https://yandex.ru/legal/maps_api/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
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
