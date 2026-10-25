'use client';

import { useState } from 'react';

import {
  type FittingRoomItem,
  closeRoom,
  MiniSwatches,
  OutfitSlotRow,
  roomItemName,
  type SwatchChoice,
} from '@/entities/fitting-room';
import { type ProductDetail, productColours, sortSizes, useProduct } from '@/entities/product';
import { useRoomActions } from '@/features/fitting-room';
import { CartStubButton } from '@/features/product-stubs';
import { useTrackedElement } from '@/shared/analytics';
import {
  Button,
  ChevronDownIcon,
  CloseIcon,
  type HexColor,
  IconButton,
  LinkButton,
  Select,
  type SelectOption,
  Sheet,
  SheetClose,
} from '@/shared/ui';

import styles from './fitting-room-drawer.module.scss';

// «Белый» from the value «белый».
function capitalised(text: string): string {
  return text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1);
}

// The product's colours: the values of its colour attribute (A76, A91); one with no swatch is an
// empty circle.
function swatchChoices(product: ProductDetail | undefined): SwatchChoice[] {
  return productColours(product).map((value) => ({
    id: value.id,
    value: capitalised(value.value),
    colorHex: value.colorHex,
  }));
}

export interface RoomSlotProps {
  item: FittingRoomItem;
  phone: boolean;
}

// A filled slot of board 2: the entity's row with the colour (A90.3: circles, no photo per
// colour), the size stub (A63.3: sent nowhere, A8), «В корзину» (A33) and «Убрать». The colours
// and sizes are the product's own, read once per item. On a phone (2.1, 2.2) one field «<цвет>,
// <размер>» opens the sheet «Цвет …» with «Готово», and × takes the item out.
export function RoomSlot({ item, phone }: RoomSlotProps) {
  const product = useProduct(item.product.id);
  const actions = useRoomActions();
  const removeEvents = useTrackedElement('room.remove', { slot: item.slot });
  const [size, setSize] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const name = roomItemName(item.product);
  const colours = swatchChoices(product.data);
  const sizes: SelectOption[] = sortSizes(
    product.data?.variations.map((variation) => variation.size) ?? [],
  ).map((value) => ({ value, label: value }));
  const colourOptions: SelectOption[] = colours.map((colour) => ({
    value: colour.id,
    label: colour.value,
    swatch: colour.colorHex as HexColor | null,
  }));
  const href = `/products/${encodeURIComponent(item.product.id)}`;
  // The colour shown: the one put, else the product's only one (a card's hanger puts none).
  const shownColour =
    item.attributeValueId ?? (colours.length === 1 ? (colours[0]?.id ?? null) : null);

  function changeColour(attributeValueId: string) {
    if (attributeValueId === shownColour) return;
    void actions.put({ product: item.product, slot: item.slot, attributeValueId }, 'silent');
  }

  function remove() {
    removeEvents.onClick();
    void actions.remove(item);
  }

  const sizeSelect = (
    <Select
      aria-label={`Размер: ${name}`}
      options={sizes}
      placeholder="Размер"
      value={size}
      onValueChange={(value) => setSize(value)}
      disabled={sizes.length === 0}
      className={styles.sizeSelect}
    />
  );
  const cart = (
    <CartStubButton size={32} textSize="body-s">
      В корзину
    </CartStubButton>
  );

  if (phone) {
    const colourName = colours.find((colour) => colour.id === shownColour)?.value;
    const summary = [colourName ?? (item.colour && capitalised(item.colour)), size]
      .filter(Boolean)
      .join(', ');
    return (
      <OutfitSlotRow
        item={item}
        href={href}
        onNavigate={closeRoom}
        controls={
          <>
            <Sheet
              title={`Цвет «${name}»`}
              open={sheetOpen}
              onOpenChange={(next) => {
                setSheetOpen(next);
                if (next) setDraft(shownColour);
              }}
              trigger={
                <button type="button" className={styles.pick} aria-label={`Цвет и размер: ${name}`}>
                  <span className={styles.pickValue}>{summary || 'Цвет и размер'}</span>
                  <ChevronDownIcon size={16} />
                </button>
              }
              footer={
                <SheetClose>
                  <Button
                    fullWidth
                    onClick={() => {
                      if (draft) changeColour(draft);
                    }}
                  >
                    Готово
                  </Button>
                </SheetClose>
              }
            >
              <div className={styles.sheetBody}>
                {colours.length > 0 ? (
                  <MiniSwatches
                    label={`Цвет «${name}»`}
                    colours={colours}
                    value={draft}
                    onValueChange={setDraft}
                  />
                ) : (
                  <p className={styles.muted}>У этой вещи один цвет</p>
                )}
                {sizeSelect}
              </div>
            </Sheet>
            {cart}
          </>
        }
        aside={
          <IconButton
            aria-label={`Убрать «${name}»`}
            variant="plain"
            size={44}
            disabled={actions.pending}
            onClick={remove}
            onPointerEnter={removeEvents.onPointerEnter}
            onPointerLeave={removeEvents.onPointerLeave}
          >
            <CloseIcon />
          </IconButton>
        }
      />
    );
  }

  return (
    <OutfitSlotRow
      item={item}
      href={href}
      onNavigate={closeRoom}
      controls={
        <>
          <Select
            aria-label={`Цвет: ${name}`}
            options={colourOptions}
            placeholder="Цвет"
            value={shownColour}
            onValueChange={(value) => {
              if (value) changeColour(value);
            }}
            // One colour, or none: nothing to choose (board 2's boots).
            disabled={colourOptions.length <= 1 || actions.pending}
            className={styles.colourSelect}
          />
          {sizeSelect}
        </>
      }
      aside={
        <>
          {cart}
          <LinkButton
            variant="secondary"
            className={styles.remove}
            disabled={actions.pending}
            onClick={remove}
            onPointerEnter={removeEvents.onPointerEnter}
            onPointerLeave={removeEvents.onPointerLeave}
          >
            Убрать
          </LinkButton>
        </>
      }
    />
  );
}
