'use client';

import { AccountShell } from '@/widgets/account-shell';
import { MyPhotos } from '@/widgets/my-photos';

// «Мои фото» (spec 0019 A19, board 10): `/customer/photos`, the account's fifth section. The photos
// are read in the browser, only once the shell shows the section signed in (spec 0017 U11).
export function PhotosPage() {
  return (
    <AccountShell section="photos">
      <MyPhotos />
    </AccountShell>
  );
}
