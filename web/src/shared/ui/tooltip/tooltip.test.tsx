import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { HeartIcon, HelpTip, IconButton, Tooltip } from '@/shared/ui';

describe('Tooltip', () => {
  it('is hidden until the trigger gets the focus', () => {
    render(
      <Tooltip content="В избранное">
        <IconButton aria-label="В избранное">
          <HeartIcon />
        </IconButton>
      </Tooltip>,
    );

    expect(screen.queryByText('В избранное', { selector: '[role], div' })).not.toBeInTheDocument();
  });

  it('shows its text on keyboard focus and hides on Esc; the trigger keeps its own name', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Найти похожие">
        <IconButton aria-label="Поиск">
          <HeartIcon />
        </IconButton>
      </Tooltip>,
    );

    await user.tab();
    const trigger = screen.getByRole('button', { name: 'Поиск' });
    expect(trigger).toHaveFocus();
    // At once on the focus, not after the 600ms of a hover.
    await vi.waitFor(() => expect(screen.getByText('Найти похожие')).toBeInTheDocument(), {
      timeout: 100,
    });

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByText('Найти похожие')).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute('aria-label', 'Поиск');
  });
});

describe('HelpTip', () => {
  function Example() {
    return (
      <>
        <p>
          Цена
          <HelpTip aria-label="Как считается цена">Цена указана с учётом скидки.</HelpTip>
        </p>
        <button type="button">Снаружи</button>
      </>
    );
  }

  async function open(user: ReturnType<typeof userEvent.setup>, how: 'click' | 'Enter') {
    const trigger = screen.getByRole('button', { name: 'Как считается цена' });
    if (how === 'click') await user.click(trigger);
    else {
      trigger.focus();
      await user.keyboard('{Enter}');
    }
    await screen.findByRole('dialog');
    return trigger;
  }

  it('is a button "?" with the given name and a closed hint', () => {
    render(<Example />);

    const trigger = screen.getByRole('button', { name: 'Как считается цена' });
    expect(trigger).toHaveTextContent('?');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['click', 'Enter'] as const)('opens a named dialog with the text on %s', async (how) => {
    const user = userEvent.setup();
    render(<Example />);

    await open(user, how);

    expect(screen.getByRole('dialog', { name: 'Как считается цена' })).toHaveTextContent(
      'Цена указана с учётом скидки.',
    );
  });

  it('closes on Esc and returns the focus to the "?"', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = await open(user, 'click');

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
