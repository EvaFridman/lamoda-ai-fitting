import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  key: '',
  loadYmaps: vi.fn(),
  reportFailure: vi.fn(),
}));

vi.mock('../lib/load-ymaps', () => ({ loadYmaps: mocks.loadYmaps }));
vi.mock('@/shared/api', () => ({ reportFailure: mocks.reportFailure }));
vi.mock('@/shared/config', () => ({
  get yandexMapsApiKey() {
    return mocks.key;
  },
}));

import { StoresMap } from './stores-map';

function renderMap() {
  return render(
    <StoresMap stores={[]} selectedId={null} onSelect={vi.fn()} fit={{ kind: 'start' }} />,
  );
}

describe('StoresMap', () => {
  beforeEach(() => {
    mocks.key = '';
    mocks.loadYmaps.mockReset();
    mocks.reportFailure.mockReset();
  });

  it('shows «Карта недоступна» without a key, loads nothing and reports nothing', () => {
    const { container } = renderMap();
    expect(screen.getByText('Карта недоступна')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('mp-block');
    expect(mocks.loadYmaps).not.toHaveBeenCalled();
    expect(mocks.reportFailure).not.toHaveBeenCalled();
  });

  it('is busy while the script loads, without the placeholder', () => {
    mocks.key = 'the-key';
    mocks.loadYmaps.mockReturnValue(new Promise(() => undefined));
    const { container } = renderMap();
    expect(mocks.loadYmaps).toHaveBeenCalledWith('the-key');
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Карта недоступна')).not.toBeInTheDocument();
  });

  it('shows the placeholder and reports a failed load once', async () => {
    mocks.key = 'the-key';
    const failure = new Error('Yandex Maps did not load');
    mocks.loadYmaps.mockRejectedValue(failure);
    const { container } = renderMap();
    expect(await screen.findByText('Карта недоступна')).toBeInTheDocument();
    await waitFor(() => expect(mocks.reportFailure).toHaveBeenCalledTimes(1));
    expect(mocks.reportFailure).toHaveBeenCalledWith(failure);
    expect(container.firstElementChild).toHaveClass('mp-block');
  });
});
