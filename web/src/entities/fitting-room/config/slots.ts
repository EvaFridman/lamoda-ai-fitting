import type { OutfitSlot } from '../model/schemas';

// The slots in the room's order (A86 (9)): five, one item each.
export const OUTFIT_SLOTS: readonly OutfitSlot[] = [
  'top',
  'bottom',
  'outerwear',
  'shoes',
  'accessory',
];

export const ROOM_CAPACITY = OUTFIT_SLOTS.length;

// Board 2's names of the slots: the row's caption, the toasts' «… в примерочной: верх» and
// «Заменили верх: …» (the same in the accusative), the phone's empty cells.
export const SLOT_TITLES: Readonly<Record<OutfitSlot, string>> = {
  top: 'Верх',
  bottom: 'Низ',
  outerwear: 'Верхняя одежда',
  shoes: 'Обувь',
  accessory: 'Аксессуар',
};

export const SLOT_ACCUSATIVE: Readonly<Record<OutfitSlot, string>> = {
  top: 'верх',
  bottom: 'низ',
  outerwear: 'верхнюю одежду',
  shoes: 'обувь',
  accessory: 'аксессуар',
};

export const SLOT_SHORT: Readonly<Record<OutfitSlot, string>> = {
  top: 'верх',
  bottom: 'низ',
  outerwear: 'пальто',
  shoes: 'обувь',
  accessory: 'аксесс.',
};

// An empty slot's caption (A62): the accessory's names what goes there.
export function emptySlotCaption(slot: OutfitSlot): string {
  return slot === 'accessory' ? 'Слот свободен: сумка, шарф или головной убор' : 'Слот свободен';
}

// «Рубашка Annen»: how the room and its toasts name an item (board 2).
export function roomItemName(product: { name: string; brand: { name: string } }): string {
  return `${product.name} ${product.brand.name}`;
}
