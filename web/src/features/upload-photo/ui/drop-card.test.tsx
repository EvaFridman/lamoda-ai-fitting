import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DropCard, dropCardClass, DropCardPicker } from './drop-card';

const MOUSE_HINT = 'Перетащите, вставьте Ctrl+V или выберите файл';
const TOUCH_HINT = 'Выберите файл или сделайте фото';

const card = () => screen.getByText('Загрузите своё фото').closest('.dropCard')!;

describe('DropCard', () => {
  it('shows the title, the mouse hint, the formats and the actions', () => {
    render(<DropCard actions={<button className={dropCardClass.link}>Выбрать файл</button>} />);

    expect(screen.getByText('Загрузите своё фото')).toBeInTheDocument();
    expect(screen.getByText(MOUSE_HINT)).toBeInTheDocument();
    expect(screen.queryByText(TOUCH_HINT)).not.toBeInTheDocument();
    expect(screen.getByText('JPG, PNG, WebP, HEIC · до 20 МБ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбрать файл' })).toHaveClass('chooseLink');
  });

  it('names the camera in the hint with touch', () => {
    render(
      <DropCard touch actions={<button className={dropCardClass.tile}>Сделать фото</button>} />,
    );

    expect(screen.getByText(TOUCH_HINT)).toBeInTheDocument();
    expect(screen.queryByText(MOUSE_HINT)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toHaveClass('tile');
  });

  it('hides the «+» circle from screen readers', () => {
    const { container } = render(<DropCard actions={null} />);

    const circle = container.querySelector('.dropCircle')!;
    expect(circle.closest('[aria-hidden="true"]')).toHaveClass('dropCircleSlot');
  });

  it('is plain by default, with the class dragging when dragging and disabled when disabled', () => {
    const { rerender } = render(<DropCard actions={null} />);
    expect(card()).not.toHaveClass('dragging');
    expect(card()).not.toHaveClass('disabled');

    rerender(<DropCard actions={null} dragging />);
    expect(card()).toHaveClass('dragging');
    expect(card()).not.toHaveClass('disabled');

    rerender(<DropCard actions={null} disabled />);
    expect(card()).toHaveClass('disabled');
    expect(card()).not.toHaveClass('dragging');
  });

  it('renders the area', () => {
    render(<DropCard actions={null} area={<button aria-label="Вся карточка" />} />);

    expect(screen.getByRole('button', { name: 'Вся карточка' })).toBeInTheDocument();
  });
});

describe('DropCardPicker', () => {
  it.each([
    ['area', 'dropArea'],
    ['link', 'chooseLink'],
    ['tile', 'tile'],
  ] as const)('draws the %s kind with the class %s and picks a file', async (kind, className) => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const { container } = render(
      <DropCardPicker kind={kind} accept="image/png" onFileChange={onFileChange}>
        Выбрать
      </DropCardPicker>,
    );

    expect(screen.getByRole('button', { name: 'Выбрать' })).toHaveClass(className);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, file);

    expect(onFileChange).toHaveBeenCalledWith(file);
  });
});
