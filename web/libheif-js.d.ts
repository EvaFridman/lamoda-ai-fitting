// The part of `libheif-js`'s browser build `heic.ts` uses: the package ships types only for the
// Emscripten module's raw functions, not for its `HeifDecoder`.
declare module 'libheif-js/wasm-bundle' {
  interface HeifDisplayData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }

  interface HeifImage {
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    // Writes the image as RGBA into `target`, with its rotation and mirroring applied (libheif's
    // default); `null` on a failure.
    display(target: HeifDisplayData, callback: (result: HeifDisplayData | null) => void): void;
    free(): void;
  }

  interface Libheif {
    HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] };
  }

  const libheif: Libheif;
  export default libheif;
}
