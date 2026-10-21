// An image given to a check or a generation: its bytes and their type. The checks send it as a
// data URL (A29: no signed link of the bucket leaves the project).
export interface ImageInput {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export function toDataUrl(image: ImageInput): string {
  return `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString('base64')}`;
}
