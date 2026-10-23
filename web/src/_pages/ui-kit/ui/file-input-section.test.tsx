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
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
    const buttons = screen.getAllByRole('button', { name: 'Загрузить фото' });
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toBeEnabled();
    expect(buttons.some((b) => b.getAttribute('aria-busy') === 'true')).toBe(true);
    expect(buttons.some((b) => b.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByText('Файл не выбран')).toBeInTheDocument();
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
