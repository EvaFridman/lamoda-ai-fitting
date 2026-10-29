import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FittingErrorCardProps } from './fitting-error-card';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/shared/analytics/client', () => ({ identify: vi.fn(), reset: vi.fn(), track }));

import { FittingErrorCard } from './fitting-error-card';

function renderCard(props: Partial<FittingErrorCardProps> = {}) {
  const handlers = { onRetry: vi.fn(), onClose: vi.fn(), onOtherPhoto: vi.fn() };
  render(
    <FittingErrorCard
      failure="model_timeout"
      left={7}
      spent={false}
      photoUrl="https://s3.test/keep/users/u/p.webp?X-Amz-Signature=a"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

function clicked(element: string) {
  return track.mock.calls.filter(
    ([event, props]) =>
      event === 'Element Clicked' && (props as { element: string }).element === element,
  );
}

beforeEach(() => {
  track.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FittingErrorCard for a timeout', () => {
  it.each([
    ['model_timeout', 'Не получилось примерить', /Сервис примерки не ответил вовремя/],
    ['provider_error', 'Сервис примерки недоступен', /Попробуйте ещё раз через несколько минут\./],
  ] as const)(
    'shows card А for %s: its title and text, nothing spent, retry and close',
    (failure, title, text) => {
      renderCard({ failure });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(
        screen.getByText('Примерка не списана · осталось 7 в этом месяце'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Другое фото' })).not.toBeInTheDocument();
      expect(screen.queryByText('Результат скрыт')).not.toBeInTheDocument();
    },
  );

  it('retries from «Попробовать ещё раз» and tracks the click', async () => {
    const { onRetry } = renderCard();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(clicked('try-on.retry')).toHaveLength(1);
  });

  it('closes from «Закрыть» and tracks it as the error screen', async () => {
    const { onClose } = renderCard();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'try-on.close', screen: 'error' }),
    );
  });

  it('leaves the count out of the notice when the quota is not known', () => {
    renderCard({ left: undefined });

    expect(screen.getByText('Примерка не списана')).toBeInTheDocument();
  });

  it.each(['model_timeout', 'moderation'] as const)(
    'does not say the try-on was not spent when it was spent (%s)',
    (failure) => {
      renderCard({ failure, spent: true });

      expect(screen.queryByText(/Примерка не списана/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeEnabled();
    },
  );

  it('shows the failure of the retry itself', () => {
    renderCard({ error: 'Нет связи с сервером' });

    expect(screen.getByText('Нет связи с сервером')).toBeInTheDocument();
  });

  it('keeps the retry busy while it runs', () => {
    renderCard({ retrying: true });

    expect(screen.getByRole('button', { name: /Попробовать ещё раз/ })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});

describe('FittingErrorCard for a moderation failure', () => {
  it('shows card Б for an output refusal: the result is hidden, with retry and another photo, no close', () => {
    renderCard({ failure: 'moderation', stage: 'output', category: 'violence' });

    expect(screen.getByText('Результат скрыт')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Не можем показать результат' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Изображение не прошло проверку безопасности\./)).toBeInTheDocument();
    expect(screen.getByText('Примерка не списана · осталось 7 в этом месяце')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Другое фото' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();
  });

  it('names an input refusal by its category', () => {
    renderCard({ failure: 'moderation', stage: 'input', category: 'violence' });

    expect(screen.getByRole('heading', { name: 'Не можем сделать примерку' })).toBeInTheDocument();
    expect(screen.getByText(/На фото или в вещах есть оружие или насилие/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Другое фото' })).toBeInTheDocument();
  });

  it('reads no category and no stage as an unknown input refusal', () => {
    renderCard({ failure: 'moderation', category: null, stage: null });

    expect(screen.getByRole('heading', { name: 'Не можем сделать примерку' })).toBeInTheDocument();
    expect(
      screen.getByText(/Фото или выбранные вещи не прошли проверку безопасности/),
    ).toBeInTheDocument();
  });

  it('goes back to the photo picker from «Другое фото» and tracks it', async () => {
    const { onOtherPhoto } = renderCard({ failure: 'moderation' });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Другое фото' }));

    expect(onOtherPhoto).toHaveBeenCalledTimes(1);
    expect(clicked('try-on.other-photo')).toHaveLength(1);
  });

  it('shows no photo, the hidden result only', () => {
    renderCard({ failure: 'moderation' });

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('puts the photo of a timeout into a recorder-blocked frame', () => {
    renderCard();

    expect(document.querySelector('img')?.closest('.mp-block')).not.toBeNull();
  });

  it('calls the button «Выбрать другое фото» on a phone', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(width < 600px)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderCard({ failure: 'moderation' });

    expect(screen.getByRole('button', { name: 'Выбрать другое фото' })).toBeInTheDocument();
  });
});
