import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FileInputSection } from './file-input-section';
import { sections } from './sections';

describe('FileInputSection', () => {
  it('is registered in the sections list', () => {
    expect(sections.map(({ id, title }) => [id, title])).toContainEqual([
      'file-input',
      'Выбор файла',
    ]);
  });

  it('shows the four examples, the loading and disabled ones inert', () => {
    render(<FileInputSection />);
    // The kit's four examples, then the DropCard's touch card adds one of each.
    const cameras = screen.getAllByRole('button', { name: 'Сделать фото' });
    expect(cameras).toHaveLength(2);
    expect(cameras[0]).toBeEnabled();
    const buttons = screen.getAllByRole('button', { name: 'Загрузить фото' });
    // Three of the kit's examples and the touch card's file tile (the fourth example is the
    // camera); the three DropCards' whole-card buttons are out of the tree (Z47).
    expect(buttons).toHaveLength(4);
    expect(document.querySelectorAll('button.dropArea')).toHaveLength(3);
    expect(buttons[0]).toBeEnabled();
    expect(buttons.some((b) => b.getAttribute('aria-busy') === 'true')).toBe(true);
    expect(buttons.some((b) => b.hasAttribute('disabled'))).toBe(true);
    expect(screen.getAllByText('Файл не выбран')).toHaveLength(2);
  });

  it('shows the DropCard section with its three cards', () => {
    render(<FileInputSection />);
    expect(screen.getByRole('heading', { name: 'DropCard' })).toBeInTheDocument();
    expect(screen.getAllByText('Загрузите своё фото')).toHaveLength(3);
    const links = screen.getAllByRole('button', { name: 'Выбрать файл' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toBeEnabled();
  });

  it('shows the chosen file type and size, never its name', async () => {
    const user = userEvent.setup();
    const { container } = render(<FileInputSection />);
    const file = new File([new Uint8Array(2048)], 'secret-name.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]:not([disabled])') as HTMLElement;
    await user.upload(input, file);
    expect(screen.getByText('Выбран файл image/png, 2 КБ')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('secret-name');
  });
});
