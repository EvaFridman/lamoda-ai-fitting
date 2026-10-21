import type { Metadata } from 'next';

import { accountSectionMetadata } from '@/_pages/customer';

export const metadata: Metadata = accountSectionMetadata('data');

export { AccountDataPage as default } from '@/_pages/account-data';
