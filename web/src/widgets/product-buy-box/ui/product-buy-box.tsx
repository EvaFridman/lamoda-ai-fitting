'use client';

import { Suspense } from 'react';

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
import { CartStubButton, FavoriteStub } from '@/features/product-stubs';
import { useTrackedElement } from '@/shared/analytics';
import { fittingHref } from '@/shared/config';
import {
  Badges,
  Button,
  HangerIcon,
  Price,
  Rating,
  Select,
  type SelectOption,
  SparkleIcon,
} from '@/shared/ui';

import styles from './product-buy-box.module.scss';

export interface ProductBuyBoxProps {
  product: ProductDetail;
  // Whether the product's category has a slot of the fitting room: none shows no «К образу» (A18).
  hasSlot: boolean;
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
// on the screen only, A8), the cart and favourite stubs, board 13's TryOnButton with «К образу»
// beside it, and the limit meter. The visitor's data (the session, the quota, the last fitting) is
// read in the browser only (AC23). Signed out, «Примерить» opens the sign-in window (A12). On a
// phone it stays in the page's flow in the same order, nothing fixed to the window (A87.2).
export function ProductBuyBox({ product, hasSlot, onTryOn }: ProductBuyBoxProps) {
  const session = useSession();
  const signedIn = session.status === 'signed-in';
  const quota = useFittingQuota(signedIn);
  const last = useLastFitting(product.id, signedIn);

  const colours = colourOptions(product);
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
          <Select aria-label="Цвет" options={colours} defaultValue={colours[0]?.value} />
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
          {hasSlot && (
            // The fitting room comes with T24; until then the button is shown and sends nothing
            // (A82), as the try-on's own «К образу» tile (A75).
            <Button size={56} variant="outline" className={styles.toLook} disabled>
              <HangerIcon />К образу
            </Button>
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
