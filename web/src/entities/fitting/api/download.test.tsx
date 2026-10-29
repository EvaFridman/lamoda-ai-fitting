import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { downloadFittingImage, fetchFittingImage } from './download';

const ID = '00000000-0000-4000-8000-0000000000e1';
const fetchMock = vi.fn();
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

function file(disposition?: string): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      ...(disposition ? { 'Content-Disposition': disposition } : {}),
    },
  });
}

function failure(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: 'm', details: [] } }), { status });
}

let click: ReturnType<typeof vi.spyOn>;
const clicked = () => click.mock.contexts as HTMLAnchorElement[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  fetchMock.mockReset();
  createObjectURL.mockReset().mockReturnValue('blob:file-1');
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchFittingImage', () => {
  it('gives a File named by the api with the blob’s type, saving nothing', async () => {
    fetchMock.mockResolvedValue(file('attachment; filename="primerka-2026-10-20-1500.webp"'));

    const result = await fetchFittingImage(ID);

    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe('primerka-2026-10-20-1500.webp');
    expect(result.type).toBe('image/webp');
    expect(result.size).toBe(3);
    expect(click).not.toHaveBeenCalled();
  });

  it('names it primerka.webp without a name and types it image/webp without a type', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));

    const result = await fetchFittingImage(ID);

    expect(result.name).toBe('primerka.webp');
    expect(result.type).toBe('image/webp');
  });

  it('rejects with the ApiError when the api refuses', async () => {
    fetchMock.mockResolvedValue(failure(503, 'SERVICE_UNAVAILABLE'));

    await expect(fetchFittingImage(ID)).rejects.toMatchObject({ kind: 'http', status: 503 });
  });
});

describe('downloadFittingImage', () => {
  it('reads the picture from the site’s own api and saves it under the api’s name', async () => {
    fetchMock.mockResolvedValue(file('attachment; filename="primerka-2026-10-20-1500.webp"'));

    await downloadFittingImage(ID);

    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(
      `/api/fittings/${ID}/image`,
    );
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(clicked()).toHaveLength(1);
    expect(clicked()[0]?.download).toBe('primerka-2026-10-20-1500.webp');
    expect(clicked()[0]?.getAttribute('href')).toBe('blob:file-1');
  });

  it('falls back to primerka.webp when the answer names no file', async () => {
    fetchMock.mockResolvedValue(file());

    await downloadFittingImage(ID);

    expect(clicked()[0]?.download).toBe('primerka.webp');
  });

  it('opens no tab and puts no link into the page', async () => {
    fetchMock.mockResolvedValue(file());
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    await downloadFittingImage(ID);

    expect(open).not.toHaveBeenCalled();
    expect(clicked()[0]?.hasAttribute('target')).toBe(false);
    expect(clicked()[0]?.isConnected).toBe(false);
    expect(document.querySelector('a')).toBeNull();
  });

  it('revokes the object URL only after 40 s', async () => {
    fetchMock.mockResolvedValue(file());

    await downloadFittingImage(ID);

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(39_999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:file-1');
  });

  it('rejects with the ApiError and saves nothing when the api refuses', async () => {
    fetchMock.mockResolvedValue(failure(404, 'NOT_FOUND'));

    await expect(downloadFittingImage(ID)).rejects.toMatchObject({ kind: 'http', status: 404 });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});
