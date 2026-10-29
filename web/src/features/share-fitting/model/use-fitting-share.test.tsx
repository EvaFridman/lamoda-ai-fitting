import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ showToast: vi.fn(), captureException: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  showToast: mocks.showToast,
}));

import { useFittingShare } from './use-fitting-share';

const ID = '00000000-0000-4000-8000-0000000000e1';
const OTHER_ID = '00000000-0000-4000-8000-0000000000e2';
const SAVED = { title: 'Файл сохранён — отправьте его из галереи' };
const fetchMock = vi.fn();
const share = vi.fn();
const canShare = vi.fn();

function image(): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Content-Disposition': 'attachment; filename="primerka-2026-10-20-1500.webp"',
    },
  });
}

function failure(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: 'm', details: [] } }), { status });
}

function setApi(api: { share?: unknown; canShare?: unknown }) {
  for (const name of ['share', 'canShare'] as const) {
    Object.defineProperty(navigator, name, {
      configurable: true,
      writable: true,
      value: api[name],
    });
  }
}

let click: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset().mockImplementation(() => Promise.resolve(image()));
  share.mockReset().mockResolvedValue(undefined);
  canShare.mockReset().mockReturnValue(true);
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:file-1');
  URL.revokeObjectURL = vi.fn();
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  setApi({ share, canShare });
});

afterEach(() => {
  setApi({});
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function ready(fittingId: string | null = ID) {
  const hook = renderHook(
    (props: { id: string | null }) => useFittingShare({ fittingId: props.id, eager: false }),
    { initialProps: { id: fittingId } },
  );
  await act(async () => {
    hook.result.current.prefetch();
  });
  return hook;
}

describe('useFittingShare', () => {
  it('shares the file with the system sheet', async () => {
    const { result } = await ready();

    await act(async () => {
      result.current.share();
    });

    expect(share).toHaveBeenCalledOnce();
    const data = share.mock.calls[0]?.[0] as { files: File[]; title: string };
    expect(data.title).toBe('Моя примерка');
    expect(data.files).toHaveLength(1);
    expect(data.files[0]).toBeInstanceOf(File);
    expect(data.files[0]?.name).toBe('primerka-2026-10-20-1500.webp');
    expect(click).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('shares within the click once the prefetch is done, without awaiting a fetch', async () => {
    const { result } = await ready();
    fetchMock.mockClear();

    act(() => result.current.share());

    expect(share).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves the file and says so when canShare refuses the file', async () => {
    canShare.mockReturnValue(false);
    const { result } = await ready();

    await act(async () => {
      result.current.share();
    });

    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts as HTMLAnchorElement[])[0]?.download).toBe(
      'primerka-2026-10-20-1500.webp',
    );
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith(SAVED);
    expect(result.current.method).toBe('download');
  });

  it('saves the file when canShare is missing', async () => {
    setApi({ share });
    const { result } = await ready();

    await act(async () => {
      result.current.share();
    });

    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith(SAVED);
  });

  it('saves the file when share is missing', async () => {
    setApi({ canShare });
    const { result } = await ready();

    await act(async () => {
      result.current.share();
    });

    expect(click).toHaveBeenCalledOnce();
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith(SAVED);
    expect(result.current.method).toBe('download');
  });

  it('does nothing visible when the visitor cancels the sheet', async () => {
    share.mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    const { result } = await ready();

    await act(async () => {
      result.current.share();
    });

    expect(share).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it.each([
    ['NotAllowedError', new DOMException('no', 'NotAllowedError')],
    ['another error', new Error('boom')],
  ])('saves the file and says so when the sheet refuses with %s', async (_name, error) => {
    share.mockRejectedValue(error);
    const { result } = await ready();

    await act(async () => {
      result.current.share();
    });

    expect(click).toHaveBeenCalledOnce();
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith(SAVED);
  });

  it('fetches once per fitting: a second prefetch and a click reuse the file', async () => {
    const { result } = await ready();

    await act(async () => {
      result.current.prefetch();
    });
    await act(async () => {
      result.current.share();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('prefetches on mount when eager', async () => {
    await act(async () => {
      renderHook(() => useFittingShare({ fittingId: ID, eager: true }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(
      `/api/fittings/${ID}/image`,
    );
  });

  it('does not fetch on mount when not eager', () => {
    renderHook(() => useFittingShare({ fittingId: ID, eager: false }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches again for another fitting', async () => {
    const { result, rerender } = await ready();

    rerender({ id: OTHER_ID });
    await act(async () => {
      result.current.prefetch();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).pathname).toBe(
      `/api/fittings/${OTHER_ID}/image`,
    );
  });

  it('does nothing without a fitting', async () => {
    const { result } = renderHook(() => useFittingShare({ fittingId: null, eager: true }));

    await act(async () => {
      result.current.prefetch();
      result.current.share();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it('reports a failed fetch on a click, shows its text, and fetches again on the next one', async () => {
    fetchMock.mockResolvedValueOnce(failure(503, 'SERVICE_UNAVAILABLE'));
    const { result } = renderHook(() => useFittingShare({ fittingId: ID, eager: false }));

    await act(async () => {
      result.current.share();
    });

    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({
      title: 'Сервис временно недоступен, попробуйте позже',
      tone: 'error',
    });
    expect(mocks.captureException).toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);

    await act(async () => {
      result.current.share();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(share).toHaveBeenCalledOnce();
  });

  it('says nothing for a failed prefetch', async () => {
    fetchMock.mockResolvedValueOnce(failure(503, 'SERVICE_UNAVAILABLE'));

    await ready();

    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('is system when the API takes the file, or exists before the file is loaded', async () => {
    const { result } = renderHook(() => useFittingShare({ fittingId: ID, eager: false }));
    expect(result.current.method).toBe('system');

    await act(async () => {
      result.current.prefetch();
    });
    expect(result.current.method).toBe('system');
  });

  it('is download without the API', () => {
    setApi({});
    const { result } = renderHook(() => useFittingShare({ fittingId: ID, eager: false }));

    expect(result.current.method).toBe('download');
  });

  describe('while the system sheet is open', () => {
    let settle: { resolve: () => void; reject: (error: unknown) => void };

    beforeEach(() => {
      share.mockImplementation(
        () =>
          new Promise<void>((resolve, reject) => {
            settle = { resolve, reject };
          }),
      );
    });

    it('ignores a second click: one share, no save, no toast', async () => {
      const { result } = await ready();

      act(() => result.current.share());
      act(() => result.current.share());

      expect(share).toHaveBeenCalledOnce();
      expect(click).not.toHaveBeenCalled();
      expect(mocks.showToast).not.toHaveBeenCalled();
      await act(async () => settle.resolve());
    });

    it('shares again after the sheet resolved', async () => {
      const { result } = await ready();

      act(() => result.current.share());
      await act(async () => settle.resolve());
      act(() => result.current.share());

      expect(share).toHaveBeenCalledTimes(2);
      await act(async () => settle.resolve());
    });

    it('shares again after the visitor cancelled the sheet', async () => {
      const { result } = await ready();

      act(() => result.current.share());
      await act(async () => settle.reject(new DOMException('cancelled', 'AbortError')));
      act(() => result.current.share());

      expect(share).toHaveBeenCalledTimes(2);
      expect(click).not.toHaveBeenCalled();
      expect(mocks.showToast).not.toHaveBeenCalled();
      await act(async () => settle.resolve());
    });
  });

  it('gives the file as null before the prefetch and the File after it', async () => {
    const { result } = renderHook(() => useFittingShare({ fittingId: ID, eager: false }));
    expect(result.current.file).toBeNull();

    await act(async () => {
      result.current.prefetch();
    });

    expect(result.current.file).toBeInstanceOf(File);
    expect(result.current.file?.name).toBe('primerka-2026-10-20-1500.webp');
  });

  it('is pending while a click waits for the file, and a second click does nothing', async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const { result } = renderHook(() => useFittingShare({ fittingId: ID, eager: false }));

    act(() => result.current.share());
    expect(result.current.pending).toBe(true);
    act(() => result.current.share());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer(image());
    });
    expect(result.current.pending).toBe(false);
    expect(share).toHaveBeenCalledOnce();
  });
});
