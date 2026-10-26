import type { Metadata } from 'next';

import { accountSectionMetadata } from '@/_pages/customer';

export const metadata: Metadata = accountSectionMetadata('stores');

export { StoresPage as default } from '@/_pages/stores/server';
