import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, createRef, useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button, Drawer, DrawerClose } from '@/shared/ui';

type User = ReturnType<typeof userEvent.setup>;

// See modal.test.tsx: the styles that give pointer events back to the sheet are not loaded in jsdom.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

function Example({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <>
      <Drawer
        trigger={<Button>Корзина</Button>}
        title="Ваша корзина"
        onOpenChange={onOpenChange}
        footer={
          <DrawerClose>
            <Button>Оформить</Button>
          </DrawerClose>
        }
      >
        <p>Кардиган</p>
      </Drawer>
      <button type="button">Снаружи</button>
    </>
  );
}

// One press, then wait for the dialog.
async function open(user: User, how: 'click' | 'Enter' | 'Space') {
  const trigger = screen.getByRole('button', { name: 'Корзина' });
  if (how === 'click') await user.click(trigger);
  else {
    trigger.focus();
    await user.keyboard(how === 'Enter' ? '{Enter}' : ' ');
  }
  await screen.findByRole('dialog');
  await vi.waitFor(() =>
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-starting-style'),
  );
  return trigger;
}

describe('Drawer', () => {
  it('is closed until the trigger is used', () => {
    render(<Example />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['click', 'Enter', 'Space'] as const)('opens on %s on the trigger', async (how) => {
    const user = setup();
    render(<Example />);

    await open(user, how);

    expect(screen.getByRole('dialog', { name: 'Ваша корзина' })).toHaveTextContent('Кардиган');
  });

  it('moves the focus inside when it opens', async () => {
    const user = setup();
    render(<Example />);
    const trigger = await open(user, 'click');

    await vi.waitFor(() =>
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement),
    );
    expect(trigger).not.toHaveFocus();
  });

  it('focuses the element given as initialFocus when it opens', async () => {
    const user = setup();
    const target = createRef<HTMLInputElement>();
    render(
      <Drawer trigger={<Button>Корзина</Button>} title="Ваша корзина" initialFocus={target}>
        <button type="button">Первая</button>
        <input ref={target} aria-label="Цель" />
      </Drawer>,
    );

    await user.click(screen.getByRole('button', { name: 'Корзина' }));
    await screen.findByRole('dialog');

    await vi.waitFor(() => expect(screen.getByRole('textbox', { name: 'Цель' })).toHaveFocus());
  });

  it('hides the content outside from assistive technology while open', async () => {
    const user = setup();
    render(<Example />);
    await open(user, 'click');

    expect(screen.queryByRole('button', { name: 'Снаружи' })).not.toBeInTheDocument();
  });

  it('closes on Esc and returns the focus to the trigger', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const trigger = await open(user, 'click');

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(onOpenChange).toHaveBeenLastCalledWith(false, 'escape-key');
  });

  it('reports a press on the backdrop as an "outside-press"', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    await open(user, 'click');
    onOpenChange.mockClear();

    const backdrop = document.querySelector('.backdrop');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);

    expect(onOpenChange).toHaveBeenCalledWith(false, 'outside-press');
  });

  it('calls onOpenChangeComplete with true after opening and false after closing', async () => {
    const user = setup();
    const onOpenChangeComplete = vi.fn();
    render(
      <Drawer
        trigger={<Button>Корзина</Button>}
        title="Ваша корзина"
        onOpenChangeComplete={onOpenChangeComplete}
      >
        <p>Кардиган</p>
      </Drawer>,
    );
    expect(onOpenChangeComplete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Корзина' }));
    await vi.waitFor(() => expect(onOpenChangeComplete).toHaveBeenLastCalledWith(true));

    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(onOpenChangeComplete).toHaveBeenLastCalledWith(false));
    expect(onOpenChangeComplete).toHaveBeenCalledTimes(2);
  });

  it('closes on the ×', async () => {
    const user = setup();
    render(<Example />);
    const trigger = await open(user, 'click');

    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes on a DrawerClose button in the footer', async () => {
    const user = setup();
    render(<Example />);
    await open(user, 'click');

    await user.click(screen.getByRole('button', { name: 'Оформить' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens as a bottom sheet with its title, content and footer, and closes on Esc', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(
      <Drawer
        side="bottom"
        trigger={<Button>Фильтры</Button>}
        title="Фильтры"
        footer={<Button>Показать</Button>}
        onOpenChange={onOpenChange}
      >
        <p>Разделы</p>
      </Drawer>,
    );

    await user.click(screen.getByRole('button', { name: 'Фильтры' }));

    const dialog = await screen.findByRole('dialog', { name: 'Фильтры' });
    expect(dialog).toHaveTextContent('Разделы');
    expect(screen.getByRole('button', { name: 'Показать' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenLastCalledWith(false, 'escape-key');
  });

  describe('onBack', () => {
    function WithBack(props: Partial<ComponentProps<typeof Drawer>>) {
      return (
        <Drawer open title="Цвет" onBack={vi.fn()} {...props}>
          <button type="button">Первый</button>
        </Drawer>
      );
    }

    // jsdom has no layout, so Base UI leaves the focus on the popup when it opens; the first Tab
    // shows which control comes first in the order.
    it('puts the "‹" first in the focus order, before the content and the ×', async () => {
      const user = setup();
      render(<WithBack open={undefined} trigger={<Button>Открыть</Button>} />);

      await user.click(screen.getByRole('button', { name: 'Открыть' }));
      const back = await screen.findByRole('button', { name: 'Назад' });
      await vi.waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());

      await user.tab();
      expect(back).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Первый' })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();
    });

    it('is named by backLabel and described by the title', async () => {
      render(<WithBack backLabel="Назад к фильтрам" title="Цвет" />);

      const back = await screen.findByRole('button', { name: 'Назад к фильтрам' });
      expect(back).toHaveAccessibleDescription('Цвет');
    });

    it('calls onBack on a click and does not close the drawer', async () => {
      const user = setup();
      const onBack = vi.fn();
      const onOpenChange = vi.fn();
      render(<WithBack onBack={onBack} onOpenChange={onOpenChange} />);

      await user.click(await screen.findByRole('button', { name: 'Назад' }));

      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('gives the button to backRef', async () => {
      const ref = { current: null as HTMLButtonElement | null };
      render(<WithBack backRef={ref} />);

      const back = await screen.findByRole('button', { name: 'Назад' });
      expect(ref.current).toBe(back);
    });

    it('has no "‹" without onBack: the content comes first, the × last', async () => {
      const user = setup();
      render(
        <Drawer trigger={<Button>Открыть</Button>} title="Цвет">
          <button type="button">Первый</button>
        </Drawer>,
      );

      await user.click(screen.getByRole('button', { name: 'Открыть' }));
      await vi.waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
      expect(screen.queryByRole('button', { name: 'Назад' })).not.toBeInTheDocument();

      await user.tab();
      expect(screen.getByRole('button', { name: 'Первый' })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();
    });
  });

  describe('closable', () => {
    it('has no "Закрыть" with closable=false, and Esc still closes', async () => {
      const user = setup();
      const onOpenChange = vi.fn();
      render(
        <Drawer open title="Цвет" closable={false} onOpenChange={onOpenChange}>
          <p>Текст</p>
        </Drawer>,
      );

      await screen.findByRole('dialog', { name: 'Цвет' });
      expect(screen.queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();

      await user.keyboard('{Escape}');

      expect(onOpenChange).toHaveBeenCalledWith(false, 'escape-key');
    });

    it('has the × by default', async () => {
      render(
        <Drawer open title="Цвет">
          <p>Текст</p>
        </Drawer>,
      );

      expect(await screen.findByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
    });
  });

  it('renders headerAction and it works', async () => {
    const user = setup();
    const onClick = vi.fn();
    render(
      <Drawer
        open
        title="Цвет"
        headerAction={
          <button type="button" onClick={onClick}>
            Сбросить
          </button>
        }
      >
        <p>Текст</p>
      </Drawer>,
    );

    await user.click(await screen.findByRole('button', { name: 'Сбросить' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe('fullHeight', () => {
    it('adds its class to a bottom sheet only', async () => {
      const { unmount } = render(
        <Drawer open side="bottom" fullHeight title="Фильтры">
          <p>Текст</p>
        </Drawer>,
      );
      const bottom = await screen.findByRole('dialog', { name: 'Фильтры' });
      const plain = bottom.className;
      unmount();

      render(
        <Drawer open side="bottom" title="Фильтры">
          <p>Текст</p>
        </Drawer>,
      );
      const without = await screen.findByRole('dialog', { name: 'Фильтры' });
      expect(plain).toMatch(/fullHeight/);
      expect(without.className).not.toMatch(/fullHeight/);
    });

    it('is ignored on the right side', async () => {
      render(
        <Drawer open fullHeight title="Корзина">
          <p>Текст</p>
        </Drawer>,
      );

      expect((await screen.findByRole('dialog')).className).not.toMatch(/fullHeight/);
    });
  });

  it('reads its description as the dialog description', async () => {
    render(
      <Drawer open title="Удалить?" description="Фото удалится.">
        <p>Текст</p>
      </Drawer>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Удалить?' });
    expect(dialog).toHaveAccessibleDescription('Фото удалится.');
  });

  it('renders media before the title and description', async () => {
    render(
      <Drawer
        open
        title="С картинкой"
        description="Строка"
        media={<span role="img" aria-label="Фото 2" />}
      />,
    );

    const dialog = await screen.findByRole('dialog', { name: 'С картинкой' });
    const image = within(dialog).getByRole('img', { name: 'Фото 2' });
    const before = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(
      image.compareDocumentPosition(within(dialog).getByText('С картинкой')) & before,
    ).toBeTruthy();
    expect(image.compareDocumentPosition(within(dialog).getByText('Строка')) & before).toBeTruthy();
  });

  it.each([
    ['false', false],
    ['null', null],
    ['undefined', undefined],
  ])(
    'renders no media for media={%s}: the title stands in the header row of the dialog',
    async (_l, media) => {
      render(<Drawer open title="Без картинки" media={media} />);

      const dialog = await screen.findByRole('dialog', { name: 'Без картинки' });
      expect(within(dialog).getByText('Без картинки').parentElement!.parentElement).toBe(dialog);
      expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
    },
  );

  it('closable={false} has no × but still closes on Esc', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(
      <Drawer
        trigger={<Button>Открыть</Button>}
        title="Без крестика"
        closable={false}
        onOpenChange={onOpenChange}
      >
        <p>Текст</p>
      </Drawer>,
    );
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    const dialog = await screen.findByRole('dialog', { name: 'Без крестика' });
    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenLastCalledWith(false, 'escape-key');
  });

  it('shows the grip only on the bottom side', async () => {
    const { rerender } = render(<Drawer open side="bottom" grip title="Снизу" />);
    const bottom = await screen.findByRole('dialog', { name: 'Снизу' });
    expect(bottom.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(bottom.firstElementChild!.tagName).toBe('SPAN');

    rerender(<Drawer open side="bottom" title="Снизу" />);
    expect(
      screen.getByRole('dialog', { name: 'Снизу' }).querySelector(':scope > span[aria-hidden]'),
    ).toBeNull();

    rerender(<Drawer open side="right" grip title="Справа" />);
    const right = await screen.findByRole('dialog', { name: 'Справа' });
    expect(right.querySelector(':scope > span[aria-hidden]')).toBeNull();
    expect(right.firstElementChild).toBe(within(right).getByText('Справа').parentElement);
  });

  it('focuses the element given as initialFocus when it opens', async () => {
    const user = setup();
    function Focused() {
      const secondRef = useRef<HTMLButtonElement>(null);
      return (
        <Drawer trigger={<Button>Открыть</Button>} title="Фокус" initialFocus={secondRef}>
          <Button>Первая</Button>
          <Button ref={secondRef}>Вторая</Button>
        </Drawer>
      );
    }
    render(<Focused />);
    await user.click(screen.getByRole('button', { name: 'Открыть' }));

    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Вторая' })).toHaveFocus());
  });

  it('renders no content block without children, and one with them', async () => {
    const { rerender } = render(<Drawer open title="Пустой" />);
    const dialog = await screen.findByRole('dialog', { name: 'Пустой' });
    const childless = dialog.children.length;

    rerender(
      <Drawer open title="Пустой">
        <p>Текст</p>
      </Drawer>,
    );

    expect(screen.getByRole('dialog', { name: 'Пустой' }).children.length).toBe(childless + 1);
    expect(screen.getByText('Текст').parentElement).not.toBe(dialog);
  });

  it('can be controlled: open shows it and onOpenChange reports the close request', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(
      <Drawer open title="Управляемый" wide onOpenChange={onOpenChange}>
        <p>Текст</p>
      </Drawer>,
    );

    expect(await screen.findByRole('dialog', { name: 'Управляемый' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false, 'escape-key');
    expect(screen.getByRole('dialog', { name: 'Управляемый' })).toBeInTheDocument();
  });
});
