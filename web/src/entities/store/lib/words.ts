// The word rule of the slice's searches (the stores', spec 0022 X7, and the cities', spec 0026
// plan §2): lower case, `ё` as `е`, split on anything but letters and digits: «Охта-Молл»,
// «ул. Ленина, 5».
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Every word of the query is the start of one of the candidates' words.
export function matchesWords(query: readonly string[], own: readonly string[]): boolean {
  return query.every((word) => own.some((candidate) => candidate.startsWith(word)));
}
