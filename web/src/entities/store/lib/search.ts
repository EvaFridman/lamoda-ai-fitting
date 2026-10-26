import type { Store } from '../model/schemas';

// Lower case, `ё` as `е`, split on anything but letters and digits: «Охта-Молл», «ул. Ленина, 5».
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function storeWords(store: Store): string[] {
  return [store.name, store.mall, store.city, store.street, ...store.metroStations].flatMap(words);
}

// The search of the stores page (spec 0022 X7, plan §3.1): a store matches when every word of the
// text is the start of a word of its name, mall, city, street or a metro station («Ладожская» →
// Охта Молл, «екат» → Екатеринбург). An empty text keeps every store; the order stays the api's.
export function matchStores(stores: readonly Store[], text: string): Store[] {
  const query = words(text);
  if (query.length === 0) return [...stores];
  return stores.filter((store) => {
    const own = storeWords(store);
    return query.every((word) => own.some((candidate) => candidate.startsWith(word)));
  });
}
