// An item's name inside a sentence: «Надеваем сарафан на бретелях», «Примерка готова: сарафан на
// бретелях». A name starting with two capitals (a brand, an abbreviation) stays as it is.
export function itemWord(name: string): string {
  const [first = '', second = ''] = name;
  if (second !== second.toLowerCase()) return name;
  return first.toLowerCase() + name.slice(1);
}
