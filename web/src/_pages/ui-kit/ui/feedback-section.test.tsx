import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@/shared/ui';

import { FeedbackSection } from './feedback-section';
import { sections } from './sections';

describe('FeedbackSection', () => {
  it('is registered in the sections list', () => {
    expect(sections.map(({ id }) => id)).toContain('feedback');
  });

  it('does not throw when a toast button is pressed without ToastProvider', async () => {
    const user = userEvent.setup();
    render(<FeedbackSection />);

    for (const name of ['Показать уведомление', 'С действием', 'Ошибка']) {
      await user.click(screen.getByRole('button', { name }));
    }

    expect(screen.getByRole('button', { name: 'Ошибка' })).toBeInTheDocument();
  });

  it('shows the toasts in the region when ToastProvider is there', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <FeedbackSection />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Показать уведомление' }));

    const region = screen.getByRole('region', { name: 'Уведомления' });
    expect(await within(region).findByText('Товар добавлен в корзину')).toBeInTheDocument();
  });

  it('shows the action toast and a second toast after its action', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <FeedbackSection />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'С действием' }));
    const region = screen.getByRole('region', { name: 'Уведомления' });
    await within(region).findByText('Товар удалён из избранного');

    await user.click(within(region).getByRole('button', { name: 'Вернуть' }));

    expect(await within(region).findByText('Товар снова в избранном')).toBeInTheDocument();
  });
});
