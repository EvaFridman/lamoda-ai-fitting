import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { Fitting } from '@/entities/fitting';

const mocks = vi.hoisted(() => ({
  finger: false,
  download: vi.fn(),
  share: vi.fn(),
  prefetch: vi.fn(),
  eager: [] as boolean[],
  clicks: {} as Record<string, Mock<(properties?: unknown) => void>>,
  shareMethod: 'system',
  shareFile: null as File | null,
  downloadPending: false,
}));

vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib')>()),
  useMediaQuery: () => mocks.finger,
}));
vi.mock('@/features/download-fitting', () => ({
  useFittingImageDownload: () => ({ download: mocks.download, pending: mocks.downloadPending }),
}));
vi.mock('@/features/share-fitting', () => ({
  useFittingShare: ({ eager }: { eager: boolean }) => {
    mocks.eager.push(eager);
    return {
      share: mocks.share,
      prefetch: mocks.prefetch,
      method: mocks.shareMethod,
      file: mocks.shareFile,
      pending: false,
    };
  },
}));
vi.mock('@/shared/analytics', () => ({
  useTrackedElement: (element: string, properties?: unknown) => {
    const onClick = (mocks.clicks[element] ??= vi.fn<(properties?: unknown) => void>());
    return {
      onClick: () => onClick(properties),
      onPointerEnter: vi.fn(),
      onPointerLeave: vi.fn(),
    };
  },
}));

import { ResultPicture } from './result-media';

const URL_RESULT = 'https://s3.test/result.webp';

function renderPicture(resultUrl: string | null = URL_RESULT, running = false) {
  const fitting = { id: 'fit-1', resultUrl } as unknown as Fitting;
  return render(
    <ResultPicture
      fitting={fitting}
      running={running ? ({ createdAt: 0, estimatedSeconds: 30, items: [] } as never) : null}
      progress={null}
      alt="Результат"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.finger = false;
  mocks.shareMethod = 'system';
  mocks.shareFile = null;
  mocks.downloadPending = false;
  mocks.eager = [];
  mocks.clicks = {};
});

describe('ResultPicture', () => {
  it('shows the picture in an mp-block frame with «Сгенерировано ИИ»', () => {
    renderPicture();

    const frame = screen.getByRole('img', { name: 'Результат' }).closest('.mp-block');
    expect(frame).not.toBeNull();
    expect(frame).toHaveTextContent('Сгенерировано ИИ');
  });

  it('keeps the link in the image’s src only', () => {
    const { container } = renderPicture();

    expect(screen.getByRole('img', { name: 'Результат' })).toHaveAttribute('src', URL_RESULT);
    const others = Array.from(container.querySelectorAll('*')).flatMap((element) =>
      Array.from(element.attributes).filter(
        ({ name, value }) => name !== 'src' && value.includes('result.webp'),
      ),
    );
    expect(others).toEqual([]);
  });

  it('opens the picture full screen on a click and sends result.picture', async () => {
    const user = userEvent.setup();
    renderPicture();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Открыть во весь экран' }));

    const dialog = screen.getByRole('dialog', { name: 'Результат примерки' });
    expect(dialog).toHaveClass('mp-block');
    expect(mocks.clicks['result.picture']).toHaveBeenCalledOnce();
  });

  it('closes with the × and gives the focus back to the picture', async () => {
    const user = userEvent.setup();
    renderPicture();
    const open = screen.getByRole('button', { name: 'Открыть во весь экран' });
    await user.click(open);

    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it('closes with Escape', async () => {
    const user = userEvent.setup();
    renderPicture();
    await user.click(screen.getByRole('button', { name: 'Открыть во весь экран' }));

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has the group of two actions, «Скачать» and «Поделиться»', () => {
    renderPicture();

    const group = screen.getByRole('group', { name: 'Действия с изображением' });
    expect(group).toContainElement(screen.getByRole('button', { name: 'Скачать' }));
    expect(group).toContainElement(screen.getByRole('button', { name: 'Поделиться' }));
  });

  it('shows the group always under a finger, not with a mouse', () => {
    const { unmount } = renderPicture();
    expect(screen.getByRole('group', { name: 'Действия с изображением' }).className).not.toMatch(
      /pictureActionsShown/,
    );
    unmount();

    mocks.finger = true;
    renderPicture();
    expect(screen.getByRole('group', { name: 'Действия с изображением' }).className).toMatch(
      /pictureActionsShown/,
    );
  });

  it('downloads the fitting’s file and sends result.download', async () => {
    const user = userEvent.setup();
    renderPicture();

    await user.click(screen.getByRole('button', { name: 'Скачать' }));

    expect(mocks.download).toHaveBeenCalledExactlyOnceWith('fit-1', null);
    expect(mocks.clicks['result.download']).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hands the prefetched share file to the download', async () => {
    const prefetched = new File([new Uint8Array([1])], 'primerka.webp', { type: 'image/webp' });
    mocks.shareFile = prefetched;
    const user = userEvent.setup();
    renderPicture();

    await user.click(screen.getByRole('button', { name: 'Скачать' }));

    expect(mocks.download).toHaveBeenCalledExactlyOnceWith('fit-1', prefetched);
  });

  it('does not download again while the file loads', async () => {
    mocks.downloadPending = true;
    const user = userEvent.setup();
    renderPicture();

    await user.click(screen.getByRole('button', { name: 'Скачать' }));

    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('shares and sends result.share with the method', async () => {
    mocks.shareMethod = 'download';
    const user = userEvent.setup();
    renderPicture();

    await user.click(screen.getByRole('button', { name: 'Поделиться' }));

    expect(mocks.share).toHaveBeenCalledOnce();
    expect(mocks.clicks['result.share']).toHaveBeenCalledExactlyOnceWith({ method: 'download' });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('prefetches the share file on a mouse hover of the picture, not of a pen', async () => {
    const user = userEvent.setup();
    renderPicture();

    await user.hover(screen.getByRole('button', { name: 'Открыть во весь экран' }));

    expect(mocks.prefetch).toHaveBeenCalled();
  });

  it('prefetches eagerly under a finger only', () => {
    renderPicture();
    expect(mocks.eager.at(-1)).toBe(false);

    mocks.finger = true;
    renderPicture();
    expect(mocks.eager.at(-1)).toBe(true);
  });

  it('has no button and no icons while the result has no link', () => {
    renderPicture(null);

    expect(screen.queryByRole('button', { name: 'Открыть во весь экран' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Скачать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Поделиться' })).not.toBeInTheDocument();
  });

  it('shows the loader and none of the actions while a fitting runs over it', () => {
    renderPicture(URL_RESULT, true);

    expect(screen.queryByRole('button', { name: 'Открыть во весь экран' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Скачать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Поделиться' })).not.toBeInTheDocument();
  });
});
