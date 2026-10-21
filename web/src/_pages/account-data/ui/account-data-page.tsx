'use client';

import { UserInitials, useMe } from '@/entities/user';
import { ProfileForm } from '@/features/edit-profile';
import { errorText } from '@/shared/api';
import { Button, Skeleton } from '@/shared/ui';
import { AccountShell } from '@/widgets/account-shell';

import styles from './account-data-page.module.scss';

// "Мои данные" (spec 0017 U5, plan §5): `/customer/account`. `/me` is read in the browser (U11),
// only once the shell shows the section, signed in: signed out, nothing asks for it.
export function AccountDataPage() {
  return (
    <AccountShell section="data">
      <AccountData />
    </AccountShell>
  );
}

// A failed read was reported by `clientFetch`; "Повторить" reads it again. Data in hand wins over a
// failed read again (a reconnect's): the form and what was typed stay.
function AccountData() {
  const me = useMe();

  if (me.data) {
    return (
      <div className={styles.data}>
        <UserInitials user={me.data} />
        {/* Another user's answer starts a new form: the typed values are the user's own. */}
        <ProfileForm key={me.data.id} user={me.data} />
      </div>
    );
  }
  if (!me.isError) {
    return (
      <div className={styles.data} aria-busy="true">
        <Skeleton width={140} height={140} radius="40%" />
        <div className={styles.placeholder}>
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} width="33%" />
        </div>
      </div>
    );
  }
  return (
    <div className={styles.failed}>
      <p className={styles.failedText} role="alert">
        {errorText(me.error)}
      </p>
      <Button variant="outline" loading={me.isFetching} onClick={() => void me.refetch()}>
        Повторить
      </Button>
    </div>
  );
}
