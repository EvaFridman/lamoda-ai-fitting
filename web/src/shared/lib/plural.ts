const rules = new Intl.PluralRules('ru-RU');

/**
 * The noun that agrees with a whole number, from its three Russian forms: "1 товар", "2 товара",
 * "5 товаров" (`['товар', 'товара', 'товаров']`).
 */
export function plural(count: number, [one, few, many]: readonly [string, string, string]): string {
  switch (rules.select(count)) {
    case 'one':
      return one;
    case 'few':
      return few;
    default:
      return many;
  }
}
