import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ showToast: vi.fn(), captureException: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  showToast: mocks.showToast,
}));

import { useFittingImageDownload } from './use-fitting-image-download';

const ID = '00000000-0000-4000-8000-0000000000e1';
const fetchMock = vi.fn();

function file(): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'Content-Type': 'image/webp' },
  });
}

function failure(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: 'm', details: [] } }), { status });
}

let click: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:file-1');
  URL.revokeObjectURL = vi.fn();
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useFittingImageDownload', () => {
  it('shows «Фото скачано» once the file is handed over', async () => {
    fetchMock.mockResolvedValue(file());
    const { result } = renderHook(() => useFittingImageDownload());

    await act(async () => {
      result.current.download(ID);
    });

    expect(click).toHaveBeenCalledOnce();
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({ title: 'Фото скачано' });
    expect(result.current.pending).toBe(false);
  });

  it('shows the toast only after the file is there, not on the call', async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const { result } = renderHook(() => useFittingImageDownload());

    act(() => result.current.download(ID));

    expect(mocks.showToast).not.toHaveBeenCalled();
    await act(async () => {
      answer(file());
    });
    expect(mocks.showToast).toHaveBeenCalledOnce();
  });

  it('is pending while it loads, and a second call then does nothing', async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const { result } = renderHook(() => useFittingImageDownload());

    act(() => result.current.download(ID));
    expect(result.current.pending).toBe(true);
    act(() => result.current.download(ID));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer(file());
    });
    expect(result.current.pending).toBe(false);
    expect(click).toHaveBeenCalledOnce();
  });

  it('takes a new download once the last one ended', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(file()));
    const { result } = renderHook(() => useFittingImageDownload());

    await act(async () => {
      result.current.download(ID);
    });
    await act(async () => {
      result.current.download(ID);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.showToast).toHaveBeenCalledTimes(2);
  });

  it('saves a given file and shows the toast without any read', () => {
    const { result } = renderHook(() => useFittingImageDownload());
    const given = new File([new Uint8Array([1, 2, 3])], 'primerka-2026-10-20-1500.webp', {
      type: 'image/webp',
    });

    act(() => result.current.download(ID, given));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts as HTMLAnchorElement[])[0]?.download).toBe(
      'primerka-2026-10-20-1500.webp',
    );
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({ title: 'Фото скачано' });
    expect(result.current.pending).toBe(false);
  });

  it('reads the file when the given one is null', async () => {
    fetchMock.mockResolvedValue(file());
    const { result } = renderHook(() => useFittingImageDownload());

    await act(async () => {
      result.current.download(ID, null);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({ title: 'Фото скачано' });
  });

  it('shows the error’s text in an error toast and no success toast on a failure', async () => {
    fetchMock.mockResolvedValue(failure(503, 'SERVICE_UNAVAILABLE'));
    const { result } = renderHook(() => useFittingImageDownload());

    await act(async () => {
      result.current.download(ID);
    });

    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({
      title: 'Сервис временно недоступен, попробуйте позже',
      tone: 'error',
    });
    expect(click).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it('says a missing result in the toast and lets it be tried again', async () => {
    fetchMock.mockResolvedValueOnce(failure(404, 'NOT_FOUND'));
    fetchMock.mockResolvedValueOnce(file());
    const { result } = renderHook(() => useFittingImageDownload());

    await act(async () => {
      result.current.download(ID);
    });
    expect(mocks.showToast).toHaveBeenLastCalledWith({
      title: 'Не найдено: возможно, запись удалили',
      tone: 'error',
    });

    await act(async () => {
      result.current.download(ID);
    });
    expect(mocks.showToast).toHaveBeenLastCalledWith({ title: 'Фото скачано' });
  });
});
