import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { heicToJpeg } from './heic';

interface FakeOptions {
  primary?: boolean;
  width?: number;
  height?: number;
  displays?: boolean;
  // `display` never calls back (libheif aborting inside).
  hangs?: boolean;
}

const decoder = vi.hoisted(() => ({
  decode: vi.fn(),
  images: [] as unknown[],
  failure: undefined as Error | undefined,
  constructed: 0,
  displayed: 0,
  started: undefined as (() => void) | undefined,
}));

vi.mock('libheif-js/wasm-bundle', () => ({
  default: {
    HeifDecoder: class {
      constructor() {
        decoder.constructed += 1;
      }
      decode(bytes: Uint8Array) {
        decoder.decode(bytes);
        if (decoder.failure) throw decoder.failure;
        return decoder.images;
      }
    },
  },
}));

function fakeImage(options: FakeOptions = {}) {
  const image = { primary: true, width: 4, height: 3, displays: true, hangs: false, ...options };
  const free = vi.fn();
  decoder.images.push({
    is_primary: () => image.primary,
    get_width: () => image.width,
    get_height: () => image.height,
    display: (target: unknown, done: (result: unknown) => void) => {
      decoder.displayed += 1;
      decoder.started?.();
      if (image.hangs) return;
      done(image.displays ? target : null);
    },
    free,
  });
  return { free, ...image };
}

const heic = (name = 'IMG_0001.HEIC', type = 'image/heic') =>
  new File(['heic-bytes'], name, { type });

describe('heicToJpeg', () => {
  const drawImage = vi.fn();
  const toBlob = vi.fn();
  const bitmap = { close: vi.fn() };
  const createImageBitmap = vi.fn();
  let hasContext = true;
  let canvases: HTMLCanvasElement[] = [];

  class FakeImageData {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
  }

  beforeEach(() => {
    decoder.images = [];
    decoder.failure = undefined;
    decoder.displayed = 0;
    decoder.started = undefined;
    decoder.decode.mockReset();
    drawImage.mockReset();
    bitmap.close.mockReset();
    createImageBitmap.mockReset();
    createImageBitmap.mockResolvedValue(bitmap);
    vi.stubGlobal('ImageData', FakeImageData);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    hasContext = true;
    canvases = [];
    toBlob.mockReset();
    toBlob.mockImplementation((done: (blob: Blob | null) => void) =>
      done(new Blob(['jpeg-bytes'], { type: 'image/jpeg' })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      canvases.push(this);
      return hasContext ? { drawImage } : null;
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('decodes the file and returns a JPEG named after it', async () => {
    fakeImage();

    const jpeg = await heicToJpeg(heic('IMG_0001.HEIC'));

    expect(jpeg).toBeInstanceOf(File);
    expect(jpeg.name).toBe('IMG_0001.jpg');
    expect(jpeg.type).toBe('image/jpeg');
    expect(await jpeg.text()).toBe('jpeg-bytes');
    const bytes = decoder.decode.mock.calls[0]?.[0] as Uint8Array;
    expect(new TextDecoder().decode(bytes)).toBe('heic-bytes');
  });

  it('decodes into pixels of the image size, makes a bitmap of them and closes it', async () => {
    fakeImage({ width: 8, height: 5 });

    await heicToJpeg(heic());

    const pixels = createImageBitmap.mock.calls[0]?.[0] as FakeImageData;
    expect(pixels).toBeInstanceOf(FakeImageData);
    expect([pixels.width, pixels.height]).toEqual([8, 5]);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('keeps a small image at its size and asks for a JPEG of quality 0.92', async () => {
    fakeImage({ width: 8, height: 5 });

    await heicToJpeg(heic());

    expect([canvases[0]?.width, canvases[0]?.height]).toEqual([8, 5]);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 8, 5);
    expect(toBlob.mock.calls[0]?.slice(1)).toEqual(['image/jpeg', 0.92]);
  });

  it('does not upscale an image of exactly 2048 px', async () => {
    fakeImage({ width: 2048, height: 1000 });

    await heicToJpeg(heic());

    expect([canvases[0]?.width, canvases[0]?.height]).toEqual([2048, 1000]);
  });

  it.each([
    [4000, 3000, 2048, 1536],
    [3000, 4000, 1536, 2048],
    [8000, 2000, 2048, 512],
  ])('scales %sx%s so its long side is 2048: %sx%s', async (width, height, w, h) => {
    fakeImage({ width, height });

    await heicToJpeg(heic());

    expect([canvases[0]?.width, canvases[0]?.height]).toEqual([w, h]);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, w, h);
  });

  it.each([
    ['photo.final.heif', 'photo.final.jpg'],
    ['noext', 'noext.jpg'],
    ['.heic', 'photo.jpg'],
  ])('names %s as %s', async (name, expected) => {
    fakeImage();

    expect((await heicToJpeg(heic(name))).name).toBe(expected);
  });

  it('takes the primary image, not the first', async () => {
    const first = fakeImage({ primary: false, width: 2, height: 2 });
    const second = fakeImage({ primary: true, width: 6, height: 7 });

    await heicToJpeg(heic());

    expect([canvases[0]?.width, canvases[0]?.height]).toEqual([6, 7]);
    expect(first.free).toHaveBeenCalledTimes(1);
    expect(second.free).toHaveBeenCalledTimes(1);
  });

  it('takes the first image when none is primary', async () => {
    fakeImage({ primary: false, width: 3, height: 9 });
    fakeImage({ primary: false, width: 5, height: 5 });

    await heicToJpeg(heic());

    expect([canvases[0]?.width, canvases[0]?.height]).toEqual([3, 9]);
  });

  it('creates one decoder for all conversions', async () => {
    vi.resetModules();
    decoder.constructed = 0;
    const fresh = await import('./heic');
    fakeImage();
    fakeImage();

    await fresh.heicToJpeg(heic('a.heic'));
    await fresh.heicToJpeg(heic('b.heic'));

    expect(decoder.constructed).toBe(1);
    expect(decoder.decode).toHaveBeenCalledTimes(2);
  });

  it('frees every image after a success', async () => {
    const images = [fakeImage({ primary: false }), fakeImage(), fakeImage({ primary: false })];

    await heicToJpeg(heic());

    for (const image of images) expect(image.free).toHaveBeenCalledTimes(1);
  });

  it('accepts exactly 50 megapixels and refuses more, freeing the images', async () => {
    fakeImage({ width: 10_000, height: 5_000 });
    await expect(heicToJpeg(heic())).resolves.toBeInstanceOf(File);

    decoder.images = [];
    const big = fakeImage({ width: 10_001, height: 5_000 });
    await expect(heicToJpeg(heic())).rejects.toThrow();
    expect(big.free).toHaveBeenCalledTimes(1);
    expect(decoder.displayed).toBe(1);
  });

  it.each([
    [0, 5],
    [5, 0],
    [-1, -1],
  ])('refuses an image of size %sx%s before decoding it', async (width, height) => {
    const image = fakeImage({ width, height });

    await expect(heicToJpeg(heic())).rejects.toThrow();
    expect(decoder.displayed).toBe(0);
    expect(image.free).toHaveBeenCalledTimes(1);
  });

  it('throws when the file holds no image', async () => {
    await expect(heicToJpeg(heic())).rejects.toThrow();
  });

  it('throws when the decoder does', async () => {
    decoder.failure = new Error('bad file');

    await expect(heicToJpeg(heic())).rejects.toThrow('bad file');
  });

  it('throws and frees the images when the pixels do not decode', async () => {
    const image = fakeImage({ displays: false });

    await expect(heicToJpeg(heic())).rejects.toThrow();
    expect(image.free).toHaveBeenCalledTimes(1);
    expect(toBlob).not.toHaveBeenCalled();
  });

  it('rejects after 30 s when the decoder never calls back, and frees the images', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const image = fakeImage({ hangs: true });

    const started = new Promise<void>((resolve) => {
      decoder.started = resolve;
    });
    const outcome = heicToJpeg(heic()).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    await started;
    await vi.advanceTimersByTimeAsync(29_999);
    expect(image.free).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(await outcome).toBeInstanceOf(Error);
    expect(image.free).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('does not time out an image that decodes in time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fakeImage();

    await expect(heicToJpeg(heic())).resolves.toBeInstanceOf(File);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('throws and frees the images when the bitmap cannot be made', async () => {
    const image = fakeImage();
    createImageBitmap.mockRejectedValue(new Error('no bitmap'));

    await expect(heicToJpeg(heic())).rejects.toThrow('no bitmap');
    expect(image.free).toHaveBeenCalledTimes(1);
  });

  it('throws when the canvas has no 2d context', async () => {
    const image = fakeImage();
    hasContext = false;

    await expect(heicToJpeg(heic())).rejects.toThrow();
    expect(image.free).toHaveBeenCalledTimes(1);
  });

  it('throws and frees the images when the canvas makes no JPEG', async () => {
    const image = fakeImage();
    toBlob.mockImplementation((done: (blob: Blob | null) => void) => done(null));

    await expect(heicToJpeg(heic())).rejects.toThrow();
    expect(image.free).toHaveBeenCalledTimes(1);
  });
});
