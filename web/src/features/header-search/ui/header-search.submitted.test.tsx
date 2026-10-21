import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { markSearchSubmitted } from '../model/submitted-search';
import { HeaderSearch } from './header-search';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../model/submitted-search', () => ({ markSearchSubmitted: vi.fn() }));

describe('HeaderSearch marks the search submitted (O105)', () => {
  beforeEach(() => {
    navigation.push.mockReset();
    vi.mocked(markSearchSubmitted).mockReset();
  });

  it('marks the trimmed query before it navigates', async () => {
    const user = userEvent.setup();
    render(<HeaderSearch />);
    await user.type(screen.getByRole('searchbox', { name: 'Поиск' }), ' платье {Enter}');
    expect(markSearchSubmitted).toHaveBeenCalledTimes(1);
    expect(markSearchSubmitted).toHaveBeenCalledWith('платье');
    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(vi.mocked(markSearchSubmitted).mock.invocationCallOrder[0]).toBeLessThan(
      navigation.push.mock.invocationCallOrder[0]!,
    );
  });

  it('marks every submit, the same query twice too', async () => {
    const user = userEvent.setup();
    render(<HeaderSearch />);
    await user.type(screen.getByRole('searchbox', { name: 'Поиск' }), 'shirt{Enter}{Enter}');
    expect(vi.mocked(markSearchSubmitted).mock.calls).toEqual([['shirt'], ['shirt']]);
  });

  it('marks nothing for an empty query', async () => {
    const user = userEvent.setup();
    render(<HeaderSearch />);
    await user.type(screen.getByRole('searchbox', { name: 'Поиск' }), '   {Enter}');
    expect(markSearchSubmitted).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
