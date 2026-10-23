// The account's five sections in the order of both menus, the header's profile menu and the
// account's own (spec 0017 U5, U6; «Мои фото» is the fifth, spec 0019 A19). `section` is also the
// value of the analytics property `section` (U14). The list lives here, not in a widget: a widget
// does not import another one.
export const accountSections = [
  { section: 'orders', title: 'Мои заказы', href: '/customer/orders' },
  { section: 'stores', title: 'Магазины', href: '/customer/stores' },
  { section: 'data', title: 'Мои данные', href: '/customer/account' },
  { section: 'fittings', title: 'Мои примерки', href: '/customer/fittings' },
  { section: 'photos', title: 'Мои фото', href: '/customer/photos' },
] as const;

export type AccountSection = (typeof accountSections)[number];
