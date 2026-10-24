import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Chip, ChipGroup } from './chip';

type Reason = 'face' | 'item' | 'other';

function renderGroup(props: {
  value: Reason[];
  multiple?: boolean;
  disabled?: boolean;
  onValueChange?: (value: Reason[]) => void;
  events?: Parameters<typeof Chip>[0]['events'];
}) {
  const onValueChange = props.onValueChange ?? vi.fn();
  render(
    <ChipGroup
      aria-label="Что поменять?"
      value={props.value}
      onValueChange={onValueChange}
      multiple={props.multiple}
      disabled={props.disabled}
    >
      <Chip value="face" events={props.events}>
        Лицо
      </Chip>
      <Chip value="item">Вещь</Chip>
      <Chip value="other">Другое</Chip>
    </ChipGroup>,
  );
  return onValueChange;
}

describe('ChipGroup', () => {
  it('is a group with its name, holding buttons', () => {
    renderGroup({ value: [] });
    const group = screen.getByRole('group', { name: 'Что поменять?' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('marks the pressed chips with aria-pressed', () => {
    renderGroup({ value: ['item'] });
    expect(screen.getByRole('button', { name: 'Вещь' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Лицо' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds a pressed value to the others', async () => {
    const user = userEvent.setup();
    const onValueChange = renderGroup({ value: ['item'] });
    await user.click(screen.getByRole('button', { name: 'Лицо' }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(['item', 'face']);
  });

  it('removes a value on a second press', async () => {
    const user = userEvent.setup();
    const onValueChange = renderGroup({ value: ['item', 'face'] });
    await user.click(screen.getByRole('button', { name: 'Вещь' }));
    expect(onValueChange).toHaveBeenCalledWith(['face']);
  });

  it('replaces the choice when multiple is false', async () => {
    const user = userEvent.setup();
    const onValueChange = renderGroup({ value: ['item'], multiple: false });
    await user.click(screen.getByRole('button', { name: 'Лицо' }));
    expect(onValueChange).toHaveBeenCalledWith(['face']);
  });

  it('releases the only pressed chip when multiple is false', async () => {
    const user = userEvent.setup();
    const onValueChange = renderGroup({ value: ['item'], multiple: false });
    await user.click(screen.getByRole('button', { name: 'Вещь' }));
    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  it('disables every chip and calls nothing when the group is disabled', async () => {
    const user = userEvent.setup();
    const onValueChange = renderGroup({ value: [], disabled: true });
    for (const chip of screen.getAllByRole('button')) expect(chip).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Лицо' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("calls the chip's own click beside the toggle", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onValueChange = renderGroup({ value: [], events: { onClick } });
    await user.click(screen.getByRole('button', { name: 'Лицо' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(['face']);
  });

  it('works as a controlled group that follows its callback', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState<Reason[]>([]);
      return (
        <ChipGroup aria-label="Причины" value={value} onValueChange={setValue}>
          <Chip value="face">Лицо</Chip>
          <Chip value="item">Вещь</Chip>
        </ChipGroup>
      );
    }
    render(<Controlled />);
    await user.click(screen.getByRole('button', { name: 'Вещь' }));
    expect(screen.getByRole('button', { name: 'Вещь' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Вещь' }));
    expect(screen.getByRole('button', { name: 'Вещь' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Chip', () => {
  it('can be disabled on its own', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <ChipGroup aria-label="Причины" value={[]} onValueChange={onValueChange}>
        <Chip value="face" disabled>
          Лицо
        </Chip>
        <Chip value="item">Вещь</Chip>
      </ChipGroup>,
    );
    expect(screen.getByRole('button', { name: 'Лицо' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Вещь' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Лицо' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
