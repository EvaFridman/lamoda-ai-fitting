import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NoticesSection } from './notices-section';
import { sections } from './sections';

describe('NoticesSection', () => {
  it('is registered in the sections list', () => {
    expect(sections.map(({ id, title }) => [id, title])).toContainEqual([
      'notices',
      'Сообщения и состояния',
    ]);
  });

  it('shows a notice of each tone', () => {
    render(<NoticesSection />);
    expect(screen.getByText('Как сделать хорошее фото')).toBeInTheDocument();
    expect(screen.getByText('Фото сохранено')).toBeInTheDocument();
    expect(screen.getByText('Можно сохранить ещё одно фото')).toBeInTheDocument();
    expect(screen.getByText('Фото не подходит для примерки')).toBeInTheDocument();
  });

  it('shows the state cards with their titles and actions', () => {
    render(<NoticesSection />);
    expect(
      screen.getByRole('heading', { level: 4, name: 'Здесь появятся ваши фото' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 4, name: 'Не удалось загрузить' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Загрузить фото' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});
