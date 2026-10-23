import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Notice } from './notice';

describe('Notice', () => {
  it('shows its text and an optional title', () => {
    render(<Notice title="Заголовок">Текст</Notice>);
    expect(screen.getByText('Заголовок')).toBeInTheDocument();
    expect(screen.getByText('Текст')).toBeInTheDocument();
  });

  it('has no title element without a title', () => {
    const { container } = render(<Notice>Текст</Notice>);
    expect(container.querySelector('p')).toBeNull();
  });

  it('has no role by default', () => {
    render(<Notice>Текст</Notice>);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['status', 'alert'] as const)('takes the role %s', (role) => {
    render(<Notice role={role}>Текст</Notice>);
    expect(screen.getByRole(role)).toHaveTextContent('Текст');
  });

  it.each(['info', 'success', 'warning', 'error'] as const)(
    'has the class of the %s tone',
    (tone) => {
      render(
        <Notice tone={tone} role="status">
          Текст
        </Notice>,
      );
      expect(screen.getByRole('status')).toHaveClass(tone);
    },
  );

  it('is info by default', () => {
    render(<Notice role="status">Текст</Notice>);
    expect(screen.getByRole('status')).toHaveClass('info');
  });

  it('draws a decorative icon, a different one for success', () => {
    const info = render(<Notice>Текст</Notice>);
    const infoSvg = info.container.querySelector('svg');
    expect(infoSvg).toHaveAttribute('aria-hidden', 'true');
    const infoPath = infoSvg?.innerHTML;
    info.unmount();

    const success = render(<Notice tone="success">Текст</Notice>);
    const successSvg = success.container.querySelector('svg');
    expect(successSvg).toHaveAttribute('aria-hidden', 'true');
    expect(successSvg?.innerHTML).not.toBe(infoPath);
  });

  it('uses the info icon for warning and error', () => {
    const info = render(<Notice>Текст</Notice>);
    const infoPath = info.container.querySelector('svg')?.innerHTML;
    info.unmount();
    for (const tone of ['warning', 'error'] as const) {
      const view = render(<Notice tone={tone}>Текст</Notice>);
      expect(view.container.querySelector('svg')?.innerHTML).toBe(infoPath);
      view.unmount();
    }
  });
});
