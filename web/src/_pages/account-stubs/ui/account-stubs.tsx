import type { AccountSection } from '@/shared/config';
import { AccountShell } from '@/widgets/account-shell';

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

export function FittingsPage() {
  return <AccountStub section="fittings" />;
}
