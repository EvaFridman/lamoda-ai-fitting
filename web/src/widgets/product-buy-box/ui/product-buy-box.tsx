'use client';

import { Suspense, useState } from 'react';

import type { OutfitSlot } from '@/entities/category';
import {
  LimitMeter,
  renewalDate,
  TriedOnNote,
  useFittingQuota,
  useLastFitting,
} from '@/entities/fitting';
import { type ProductDetail, sortSizes } from '@/entities/product';
import { useSession } from '@/entities/session';
import { LoginModal } from '@/features/auth';
import { ToLookButton } from '@/features/fitting-room';
import { CartStubButton, FavoriteStub } from '@/features/product-stubs';
import { useTrackedElement } from '@/shared/analytics';
import { fittingHref } from '@/shared/config';
import { Badges, Button, Price, Rating, Select, type SelectOption, SparkleIcon } from '@/shared/ui';

import styles from './product-buy-box.module.scss';

export interface ProductBuyBoxProps {
  product: ProductDetail;
  // The slot of the fitting room of the product's category: none shows no «К образу» (A18).
  slot: OutfitSlot | null;
  // «Примерить» of a signed-in user: the page opens the try-on window (a widget of its own).
  onTryOn: () => void;
}

// «Белый» from the value «белый».
function capitalised(text: string): string {
  return text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1);
}

// The product's colours: its own values of a colour attribute, one with a swatch (spec 0019 A76).
function colourOptions(product: ProductDetail): SelectOption[] {
  const thumbnail = product.image?.url;
  return product.attributes
    .flatMap((attribute) => attribute.values)
    .filter((value) => value.colorHex !== null)
    .map((value) => ({ value: value.id, label: capitalised(value.value), thumbnail }));
}

// The product page's buy box (spec 0019 T20, boards 1, 11 and 13; A33, A62, A63.2, A82): the
// rating, the brand and name, the price and discount, «Вы это примеряли», the colour and size (kept
// on the screen only, A8; the colour goes into the fitting room with «К образу»), the cart and
// favourite stubs, board 13's TryOnButton with «К образу» («В образе» once in the room, A82.2)
// beside it, and the limit meter. The visitor's data (the session, the quota, the last fitting) is
// read in the browser only (AC23). Signed out, «Примерить» opens the sign-in window (A12). On a
// phone it stays in the page's flow in the same order, nothing fixed to the window (A87.2).
export function ProductBuyBox({ product, slot, onTryOn }: ProductBuyBoxProps) {
  const session = useSession();
  // The colour chosen: «К образу» puts the product in it (A90.1).
  const [colour, setColour] = useState<string | null>(null);
  // The sign-in window of a visitor's «К образу» (A12, AC16).
  const [signIn, setSignIn] = useState(false);
  const signedIn = session.status === 'signed-in';
  const quota = useFittingQuota(signedIn);
  const last = useLastFitting(product.id, signedIn);

  const colours = colourOptions(product);
  const chosenColour = colour ?? colours[0]?.value ?? null;
  const sizes: SelectOption[] = sortSizes(
    product.variations.map((variation) => variation.size),
  ).map((size) => ({ value: size, label: size }));
  const discounted = product.discount > 0;
  const spent = quota.data !== undefined && quota.data.left <= 0;
  const loading = session.status === 'pending' || (signedIn && quota.isPending);
  const lastFitting = last.data;
  const triedOn = signedIn && lastFitting?.status === 'completed';

  // Their clicks and hovers (A84): the stubs with whether «Вы это примеряли» is shown, «Примерить»
  // with whether the visitor is signed in. A disabled or loading button sends nothing.
  const cartEvents = useTrackedElement('buy-box.add-to-cart', { tried_on: triedOn });
  const favouriteEvents = useTrackedElement('buy-box.favourite', { tried_on: triedOn });
  const tryOnEvents = useTrackedElement('buy-box.try-on', { signed_in: signedIn });
  const triedOnEvents = useTrackedElement('buy-box.tried-on');
  // A loading button stays focusable (`aria-disabled`): the kit stops its click, not its pointer
  // events, so no hover starts while it loads or is spent. The leave stays, so one started before
  // the button turned off is still cancelled.
  const tryOnHover = {
    onPointerEnter: loading || spent ? undefined : tryOnEvents.onPointerEnter,
    onPointerLeave: tryOnEvents.onPointerLeave,
  };

  const tryOn = signedIn ? (
    <Button
      size={56}
      className={styles.tryOn}
      loading={loading}
      disabled={spent}
      {...tryOnHover}
      onClick={() => {
        tryOnEvents.onClick();
        onTryOn();
      }}
    >
      <SparkleIcon />
      Примерить
    </Button>
  ) : (
    <Suspense
      fallback={
        <Button size={56} className={styles.tryOn} loading>
          <SparkleIcon />
          Примерить
        </Button>
      }
    >
      <LoginModal
        handlesReturnedError={false}
        trigger={
          // Base UI's trigger merges these with its own opening of the window.
          <Button
            size={56}
            className={styles.tryOn}
            loading={loading}
            {...tryOnHover}
            onClick={tryOnEvents.onClick}
          >
            <SparkleIcon />
            Примерить
          </Button>
        }
      />
    </Suspense>
  );

  return (
    <section aria-label="Покупка" className={styles.box}>
      <Rating value={product.rating} />
      <h1 className={styles.brand}>{product.brand.name}</h1>
      <p className={styles.name}>{product.name}</p>
      <div className={styles.price}>
        <Price
          price={product.finalPrice}
          oldPrices={discounted ? [product.price] : undefined}
          variant="product"
        />
        {discounted && (
          <Badges badges={[{ tone: 'discount', label: `−${product.discount}%` }]} size="l" />
        )}
      </div>

      {triedOn && (
        <TriedOnNote
          fitting={lastFitting}
          productId={product.id}
          href={fittingHref(lastFitting.id)}
          events={triedOnEvents}
          className={styles.note}
        />
      )}

      <div className={styles.selects}>
        {colours.length > 0 && (
          <Select
            aria-label="Цвет"
            options={colours}
            value={chosenColour}
            onValueChange={(value) => setColour(value)}
          />
        )}
        {sizes.length > 0 && (
          <Select aria-label="Размер" options={sizes} placeholder="Выберите размер" />
        )}
      </div>

      <div className={styles.actions}>
        <div className={styles.cart}>
          <CartStubButton size={48} className={styles.grow} events={cartEvents}>
            Добавить в корзину
          </CartStubButton>
          <FavoriteStub size={48} events={favouriteEvents} />
        </div>
        <div className={styles.fitting}>
          {tryOn}
          {slot && (
            <ToLookButton
              product={product}
              slot={slot}
              attributeValueId={chosenColour}
              element="buy-box.to-look"
              onSignIn={() => setSignIn(true)}
              className={styles.toLook}
            />
          )}
          {slot && !signedIn && (
            // It reads the query (`useSearchParams`).
            <Suspense fallback={null}>
              <LoginModal open={signIn} onOpenChange={setSignIn} handlesReturnedError={false} />
            </Suspense>
          )}
        </div>
        {signedIn && quota.data && (
          <LimitMeter left={quota.data.left} limit={quota.data.limit} className={styles.meter}>
            {spent ? `Закончились · снова с ${renewalDate(quota.data.renewsAt)}` : undefined}
          </LimitMeter>
        )}
      </div>
    </section>
  );
}
