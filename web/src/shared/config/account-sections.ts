import { STORES_HREF } from './stores';

// The account's five sections in the order of both menus, the header's profile menu and the
// account's own (spec 0017 U5, U6; «Мои фото» is the fifth, spec 0019 A19). `section` is also the
// value of the analytics property `section` (U14). The list lives here, not in a widget: a widget
// does not import another one. `fullLoad`: every menu links it as a plain <a>, so the page loads
// in full with its own policy (the stores page's map, spec 0022 X16).
export const accountSections = [
  { section: 'orders', title: 'Мои заказы', href: '/customer/orders', fullLoad: false },
  { section: 'stores', title: 'Магазины', href: STORES_HREF, fullLoad: true },
  { section: 'data', title: 'Мои данные', href: '/customer/account', fullLoad: false },
  { section: 'fittings', title: 'Мои примерки', href: '/customer/fittings', fullLoad: false },
  { section: 'photos', title: 'Мои фото', href: '/customer/photos', fullLoad: false },
] as const;

export type AccountSection = (typeof accountSections)[number];
