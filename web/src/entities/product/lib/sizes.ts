// Sizes are free text in the api and come in text order (`L, M, S, XL`); the size filter lists them
// in clothing order (K13): letter sizes from small to large, then numbers ascending, then the rest
// by text.
const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const LETTER_ALIASES: Record<string, string> = { XXXL: '3XL' };
const NUMBER = /^\d+(?:[.,]\d+)?$/;

type SizeKey = { group: 0 | 1; rank: number } | { group: 2 };

function sizeKey(size: string): SizeKey {
  const text = size.trim().toUpperCase();
  const letter = LETTER_SIZES.indexOf(LETTER_ALIASES[text] ?? text);
  if (letter !== -1) return { group: 0, rank: letter };
  if (NUMBER.test(text)) return { group: 1, rank: Number(text.replace(',', '.')) };
  return { group: 2 };
}

export function compareSizes(a: string, b: string): number {
  const left = sizeKey(a);
  const right = sizeKey(b);
  if (left.group !== right.group) return left.group - right.group;
  if (left.group !== 2 && right.group !== 2 && left.rank !== right.rank) {
    return left.rank - right.rank;
  }
  return a.localeCompare(b, 'ru');
}

// A sorted copy; the input is left as it is.
export function sortSizes(sizes: readonly string[]): string[] {
  return [...sizes].sort(compareSizes);
}
