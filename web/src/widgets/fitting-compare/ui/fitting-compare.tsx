'use client';

import Image from 'next/image';

import {
  AiLabel,
  type Fitting,
  type FittingDifference,
  fittingDifference,
  fittingSum,
  historyDate,
  ItemsStrip,
  useFitting,
} from '@/entities/fitting';
import { CartStubButton, FavoriteStub } from '@/features/product-stubs';
import { useTrackedElement } from '@/shared/analytics';
import { ApiError, errorText } from '@/shared/api';
import { FITTINGS_HREF, fittingHref, PHONE_QUERY } from '@/shared/config';
import { formatPrice, useMediaQuery } from '@/shared/lib';
import { Button, CompareIcon, Skeleton, StateCard } from '@/shared/ui';

import styles from './fitting-compare.module.scss';

export interface FittingCompareProps {
  // The two entries of the address, each a uuid or undefined (A93.1).
  a?: string;
  b?: string;
}

// One of the two compared entries is not there (a wrong address, a deleted or someone else's
// entry, one not completed): the way back to the history.
function CompareMissing() {
  return (
    <StateCard
      icon={<CompareIcon />}
      title="Нечего сравнить"
      className={styles.state}
      actions={<Button href={FITTINGS_HREF}>К истории примерок</Button>}
    >
      Не удалось открыть сравнение. Выберите две примерки в истории.
    </StateCard>
  );
}

function missing(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'http' && error.status === 404;
}

// The colour a phone's button names: «Белый в корзину» for one item.
function cartLabel(fitting: Fitting): string {
  const colour = fitting.kind === 'single' ? fitting.items[0]?.colour : null;
  if (!colour) return 'В корзину';
  return `${colour.charAt(0).toUpperCase()}${colour.slice(1)} в корзину`;
}

interface ColumnProps {
  fitting: Fitting;
  // «Первая примерка», «Вторая примерка».
  label: string;
  difference: FittingDifference;
  phone: boolean;
}

// A column of board 9: the result with «Сгенерировано ИИ», the item with its colour marked when it
// differs (a look: its strip and «Образ»), the date and the price, and «В корзину», «Открыть» and
// the heart; on a phone (9.3) the colour and the time under the picture.
function Column({ fitting, label, difference, phone }: ColumnProps) {
  const openElement = useTrackedElement('compare.open', { kind: fitting.kind });
  const cartElement = useTrackedElement('compare.add-to-cart');
  const single = fitting.kind === 'single' ? fitting.items[0] : undefined;
  const changed = single !== undefined && difference.colourChanged.has(single.productId);

  return (
    // Named by its place, not its date: recordings keep attributes (A37).
    <section className={styles.column} aria-label={label}>
      <div className={['mp-block', styles.picture].join(' ')}>
        {fitting.resultUrl && (
          // `unoptimized`: Next's optimizer would fetch the signed link itself.
          <Image
            className={styles.image}
            src={fitting.resultUrl}
            alt=""
            fill
            sizes="(width < 600px) 50vw, 480px"
            unoptimized
          />
        )}
        <AiLabel className={styles.ai} />
      </div>
      <div className={styles.caption}>
        <div className={styles.about}>
          {/* A div: a look's strip is a list, which a paragraph cannot hold. */}
          <div className={styles.name}>
            {single && single.colour === null && single.name}
            {single && single.colour !== null && (
              <>
                {phone ? null : `${single.name} · `}
                <span className={changed ? styles.diff : undefined}>{single.colour}</span>
              </>
            )}
            {!single && (
              <span className={styles.look}>
                <ItemsStrip items={fitting.items} />
                Образ
              </span>
            )}
            {/* One item or a look: exactly one of the three above. */}
          </div>
          <p className={styles.meta}>
            {historyDate(fitting.createdAt)}
            {phone ? null : ` · ${formatPrice(fittingSum(fitting))}`}
          </p>
        </div>
        {phone ? null : (
          <div className={styles.actions}>
            <CartStubButton size={40} textSize="body-s" events={cartElement}>
              В корзину
            </CartStubButton>
            {/* `mp-block`: its link names the user's fitting (A37), as `TriedOnNote`'s does. */}
            <Button
              variant="outline"
              size={40}
              textSize="body-s"
              className="mp-block"
              href={fittingHref(fitting.id)}
              onClick={openElement.onClick}
              onPointerEnter={openElement.onPointerEnter}
              onPointerLeave={openElement.onPointerLeave}
            >
              Открыть
            </Button>
            <FavoriteStub size={32} />
          </div>
        )}
      </div>
    </section>
  );
}

function PhoneCart({ fitting }: { fitting: Fitting }) {
  const cartElement = useTrackedElement('compare.add-to-cart');
  return (
    <CartStubButton size={48} className={styles.phoneCart} events={cartElement}>
      {cartLabel(fitting)}
    </CartStubButton>
  );
}

function Compared({ a, b }: Required<FittingCompareProps>) {
  const phone = useMediaQuery(PHONE_QUERY);
  const left = useFitting(a);
  const right = useFitting(b);

  if (missing(left.error) || missing(right.error)) return <CompareMissing />;
  const failure = left.error ?? right.error;
  if (failure && (!left.data || !right.data)) {
    return (
      <div className={styles.failed}>
        <p className={styles.failedText} role="alert">
          {errorText(failure)}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            if (left.error) void left.refetch();
            if (right.error) void right.refetch();
          }}
        >
          Повторить
        </Button>
      </div>
    );
  }
  if (!left.data || !right.data) {
    return (
      <div className={styles.compare} aria-busy="true">
        <Skeleton height="auto" className={styles.skeleton} />
        <Skeleton height="auto" className={styles.skeleton} />
      </div>
    );
  }
  if (left.data.status !== 'completed' || right.data.status !== 'completed') {
    return <CompareMissing />;
  }

  const difference = fittingDifference(left.data, right.data);
  const photo = difference.rows.find((row) => row.label === 'Фото');
  return (
    <div className={styles.page}>
      <div className={styles.compare}>
        <Column fitting={left.data} label="Первая примерка" difference={difference} phone={phone} />
        <Column
          fitting={right.data}
          label="Вторая примерка"
          difference={difference}
          phone={phone}
        />
        <aside className={styles.differences} aria-labelledby="compare-differences">
          <h2 id="compare-differences" className={styles.heading}>
            {phone ? 'Отличия' : 'Чем отличаются'}
          </h2>
          <dl className={styles.rows}>
            {(phone
              ? [{ label: 'Отличается', value: difference.differs }, ...(photo ? [photo] : [])]
              : difference.rows
            ).map((row) => (
              <div key={row.label} className={styles.row}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
      {phone && (
        <div className={styles.phoneCarts}>
          <PhoneCart fitting={left.data} />
          <PhoneCart fitting={right.data} />
        </div>
      )}
    </div>
  );
}

// Board 9's compare of two history entries side by side (spec 0019 A41, A62, A93): two columns and
// «Чем отличаются» (the colour, the photo, the price); on a phone (9.3) the two pictures side by
// side, «Отличается» and «Фото», and a «<Цвет> в корзину» for each. «Рядом» only: no overlay, no
// «Заменить запись» (A41, A63.5). Read in the browser only (spec 0017 U11).
export function FittingCompare({ a, b }: FittingCompareProps) {
  if (a === undefined || b === undefined || a === b) return <CompareMissing />;
  return <Compared a={a} b={b} />;
}
