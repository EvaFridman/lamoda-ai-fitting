'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { renewalDate, useFittingQuota } from '@/entities/fitting';
import { Button, SparkleIcon } from '@/shared/ui';
import { TryOn } from '@/widgets/try-on';

import styles from './account-stubs.module.scss';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(value: string | null): string | undefined {
  return value !== null && UUID.test(value) ? value : undefined;
}

// The try-on's temporary entry (spec 0019 T15): `?product=<id>` shows «Примерить» as the product
// page's buy box will (board 13's TryOnButton; off at the limit with the renewal date, board 11),
// `?fitting=<id>` (the toast's «Открыть») opens that fitting at once. Not tracked; T20 removes it
// once the product page opens the try-on.
export function TryOnEntry() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const productId = uuidParam(params.get('product'));
  const fittingId = uuidParam(params.get('fitting'));
  const [open, setOpen] = useState(fittingId !== undefined);
  const [openedFitting, setOpenedFitting] = useState(fittingId);
  const quota = useFittingQuota();

  // Another fitting's link while this page is open (a second toast) opens it.
  if (fittingId !== openedFitting) {
    setOpenedFitting(fittingId);
    if (fittingId !== undefined) setOpen(true);
  }

  if (!productId && !fittingId) return null;
  const spent = quota.data?.left === 0;

  return (
    <div className={styles.entry}>
      {productId && (
        <>
          <Button size={56} disabled={spent} onClick={() => setOpen(true)}>
            <SparkleIcon />
            Примерить
          </Button>
          {spent && quota.data && (
            <p className={styles.text}>
              Примерки снова будут доступны {renewalDate(quota.data.renewsAt)}
            </p>
          )}
        </>
      )}
      {open && (
        <TryOn
          // Another fitting's link opens a new window, not the state of the one shown.
          key={openedFitting ?? productId}
          productId={productId}
          fittingId={openedFitting}
          onClose={() => {
            setOpen(false);
            // The fitting leaves the address: a later link to it (its toast) opens it again.
            if (fittingId !== undefined) {
              const rest = new URLSearchParams(params.toString());
              rest.delete('fitting');
              const query = rest.toString();
              router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
            }
          }}
        />
      )}
    </div>
  );
}
