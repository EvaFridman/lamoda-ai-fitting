import { connection } from 'next/server';

import { HeaderRoom } from './header-room';

// Per request, as the profile (`HeaderProfileSlot`): a visitor's icon is a login modal's trigger,
// which reads the query. Wrap it in <Suspense>.
export async function HeaderRoomSlot() {
  await connection();
  return <HeaderRoom />;
}
