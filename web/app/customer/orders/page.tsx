import type { Metadata } from 'next';

import { accountSectionMetadata } from '@/_pages/customer';

export const metadata: Metadata = accountSectionMetadata('orders');

export { OrdersPage as default } from '@/_pages/account-stubs';
