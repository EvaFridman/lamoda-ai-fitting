import type { Store } from '../model/schemas';

// A phone as a `tel:` link: `+` and digits only, out of Lamoda's text «+7 (917) 599–61–90».
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`;
}

// Yandex Maps' route to the store by car (its documented `rtext` link); the empty start is
// "from where I am" (spec 0022 X8).
export function routeHref(store: Pick<Store, 'latitude' | 'longitude'>): string {
  return `https://yandex.ru/maps/?rtext=~${store.latitude},${store.longitude}&rtt=auto`;
}

// «г. Москва, пл. Манежная, 1 с2»: the parts that are there.
export function storeAddress(store: Pick<Store, 'city' | 'street' | 'house'>): string {
  return [store.city, store.street, store.house].filter(Boolean).join(', ');
}
