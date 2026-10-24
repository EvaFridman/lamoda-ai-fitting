import { Suspense } from 'react';

import type { AccountSection } from '@/shared/config';
import { AccountShell } from '@/widgets/account-shell';

import { TryOnEntry } from './try-on-entry';

import styles from './account-stubs.module.scss';

// A section that is not built yet (spec 0017 U5, AC6): its title and a line that it is coming.
function AccountStub({ section }: { section: AccountSection['section'] }) {
  return (
    <AccountShell section={section}>
      <p className={styles.text}>Раздел скоро появится</p>
    </AccountShell>
  );
}

export function OrdersPage() {
  return <AccountStub section="orders" />;
}

export function StoresPage() {
  return <AccountStub section="stores" />;
}

// The history comes with T16; until the product page (T20) it holds the try-on's temporary entry.
export function FittingsPage() {
  return (
    <AccountShell section="fittings">
      <p className={styles.text}>Раздел скоро появится</p>
      <Suspense>
        <TryOnEntry />
      </Suspense>
    </AccountShell>
  );
}
