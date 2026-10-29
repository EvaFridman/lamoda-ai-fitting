import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DropCardDemo } from './drop-card-demo';

const cards = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.dropCard')];

describe('DropCardDemo', () => {
  it('shows the live mouse card, the static dragging one and the touch one', () => {
    const { container } = render(<DropCardDemo />);
    const [live, held, touch] = cards(container);

    expect(cards(container)).toHaveLength(3);
    expect(live).not.toHaveClass('dragging');
    expect(held).toHaveClass('dragging');
    expect(touch).not.toHaveClass('dragging');
    expect(screen.getAllByText('Перетащите, вставьте Ctrl+V или выберите файл')).toHaveLength(2);
    expect(screen.getByText('Выберите файл или сделайте фото')).toBeInTheDocument();
    // The whole-card buttons are a pointer's target only (Z47): out of the tree and the tab order.
    // (aria-hidden takes the name out of the tree, so they are found by class.)
    const areas = container.querySelectorAll('button.dropArea');
    expect(areas).toHaveLength(3);
    for (const area of areas) {
      expect(area).toBeEnabled();
      expect(area).toHaveAttribute('aria-label', 'Загрузить фото');
      expect(area).toHaveAttribute('tabindex', '-1');
      expect(area).toHaveAttribute('aria-hidden', 'true');
    }
    // Only the touch card's file tile is reachable.
    expect(screen.getAllByRole('button', { name: 'Загрузить фото' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Выбрать файл' })).toHaveLength(2);
    expect(screen.getByText('Файл не выбран')).toBeInTheDocument();
  });

  it('picks a file with the whole-card button of the live card, showing type and size only', async () => {
    const user = userEvent.setup();
    const { container } = render(<DropCardDemo />);
    const file = new File([new Uint8Array(3072)], 'secret-name.jpg', { type: 'image/jpeg' });
    const live = cards(container)[0]!;
    const area = live.querySelector('button.dropArea')!;
    const input = area.nextElementSibling as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'file');

    await user.upload(input, file);

    expect(screen.getByText('Выбран файл image/jpeg, 3 КБ')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('secret-name');
  });

  it('fills the live card while a file is dragged over it and lets go on leaving', () => {
    const { container } = render(<DropCardDemo />);
    const live = cards(container)[0]!;
    const target = screen.getAllByText('Загрузите своё фото')[0]!;

    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'] } });
    expect(live).toHaveClass('dragging');

    const leave = createEvent.dragLeave(target, { dataTransfer: { types: ['Files'] } });
    Object.defineProperty(leave, 'relatedTarget', { value: document.body });
    fireEvent(target, leave);
    expect(live).not.toHaveClass('dragging');
  });

  it('ignores a drag of text', () => {
    const { container } = render(<DropCardDemo />);
    const target = screen.getAllByText('Загрузите своё фото')[0]!;

    fireEvent.dragEnter(target, { dataTransfer: { types: ['text/plain'] } });

    expect(cards(container)[0]).not.toHaveClass('dragging');
  });

  it('shows the dropped file’s type and size, never its name', () => {
    const { container } = render(<DropCardDemo />);
    const target = screen.getAllByText('Загрузите своё фото')[0]!;
    const file = new File([new Uint8Array(2048)], 'secret-name.png', { type: 'image/png' });

    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'] } });
    fireEvent.drop(target, { dataTransfer: { types: ['Files'], files: [file] } });

    expect(screen.getByText('Выбран файл image/png, 2 КБ')).toBeInTheDocument();
    expect(cards(container)[0]).not.toHaveClass('dragging');
    expect(container).not.toHaveTextContent('secret-name');
  });

  it('shows the type and size of a file chosen through the link, never its name', async () => {
    const user = userEvent.setup();
    const { container } = render(<DropCardDemo />);
    const file = new File([new Uint8Array(1)], 'secret-name.webp', { type: 'image/webp' });
    const input = cards(container)[0]!.querySelector<HTMLInputElement>('input[type="file"]')!;

    await user.upload(input, file);

    expect(screen.getByText('Выбран файл image/webp, 1 КБ')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('secret-name');
  });
});
