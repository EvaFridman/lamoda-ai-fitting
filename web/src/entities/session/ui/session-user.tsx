import { userInitials, userName } from '../lib/user-label';
import type { SessionUser } from '../model/schemas';

import styles from './session-user.module.scss';

export interface SessionUserProps {
  user: SessionUser;
}

// The top of the profile menu (spec 0013 N12, AC3): a circle with the initial and the name beside
// it, no email and no picture (N6). Both are personal data, so they stay text, never an attribute
// (0008); the menu's MenuHeader that holds this block carries `mp-block`.
export function SessionUserBadge({ user }: SessionUserProps) {
  return (
    <span className={styles.user}>
      <span className={styles.initials} aria-hidden="true">
        {userInitials(user)}
      </span>
      <span className={styles.name}>{userName(user)}</span>
    </span>
  );
}
