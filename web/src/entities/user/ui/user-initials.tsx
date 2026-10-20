import { profileInitials } from '../lib/initials';
import type { User } from '../model/schemas';

import styles from './user-initials.module.scss';

export interface UserInitialsProps {
  user: Pick<User, 'firstName' | 'lastName' | 'email'>;
}

// The large initials of "Мои данные", without Lamoda's upload button (spec 0017 U3, 0013 N6). The
// letters are personal data: text only, never an attribute, in an `mp-block` that recordings skip
// (plan §7). Hidden from screen readers: the form below shows the names themselves.
export function UserInitials({ user }: UserInitialsProps) {
  return (
    <span className={`${styles.initials} mp-block`} aria-hidden="true">
      {profileInitials(user)}
    </span>
  );
}
