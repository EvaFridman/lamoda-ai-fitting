// A HEIC or HEIF photo (an iPhone's) is turned into a JPEG in the browser before its upload: the
// api takes JPG, PNG and WebP only (spec 0024 Z15). The decoder, libheif compiled to WebAssembly
// (about 2 MB), loads only when such a file arrives, as a chunk of its own (plan §8). Which file is
// a HEIC is `photoFormat`'s (`upload-error.ts`), the one table of the formats.

// The api refuses an image over 50 megapixels; a bigger HEIC is not decoded into the tab's memory.
const MAX_PIXELS = 50_000_000;
// The api makes a WebP of at most 2048 px of any photo (spec 0019 A31), so the JPEG is no bigger:
// a full-size canvas would also pass iOS Safari's limit of about 16.7 megapixels.
const MAX_SIDE = 2048;
const JPEG_QUALITY = 0.92;
// libheif's `display` never calls back when it throws inside (an out-of-memory abort, say).
const DECODE_TIMEOUT_MS = 30_000;

type Decoder = InstanceType<(typeof import('libheif-js/wasm-bundle'))['default']['HeifDecoder']>;

// One decoder for the tab: libheif frees a decoder's last file (its copy of the bytes) only at its
// next `decode`, so a decoder per file would keep every file's copy until the tab reloads.
let decoder: Decoder | undefined;

/** The photo as a JPEG of at most 2048 px named `<name>.jpg`; throws when it cannot be read. */
export async function heicToJpeg(file: File): Promise<File> {
  const [{ default: libheif }, bytes] = await Promise.all([
    import('libheif-js/wasm-bundle'),
    file.arrayBuffer(),
  ]);
  decoder ??= new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(bytes));
  try {
    const image = images.find((candidate) => candidate.is_primary()) ?? images[0];
    if (!image) throw new Error('No image in the HEIC file');
    const width = image.get_width();
    const height = image.get_height();
    if (width <= 0 || height <= 0) throw new Error('The HEIC image has no size');
    if (width * height > MAX_PIXELS) throw new Error('The HEIC image is too large');

    const pixels = new ImageData(width, height);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('The HEIC image took too long')),
        DECODE_TIMEOUT_MS,
      );
      image.display(pixels, (result) => {
        clearTimeout(timer);
        if (result) resolve();
        else reject(new Error('The HEIC image did not decode'));
      });
    });

    // The full-size pixels become a bitmap, drawn scaled onto a canvas of the upload's size.
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas context');
    const bitmap = await createImageBitmap(pixels);
    try {
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    } finally {
      bitmap.close();
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('The JPEG was not made');
    return new File([blob], `${file.name.replace(/\.[^.]*$/, '') || 'photo'}.jpg`, {
      type: 'image/jpeg',
    });
  } finally {
    for (const image of images) image.free();
  }
}
