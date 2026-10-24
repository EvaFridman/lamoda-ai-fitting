import type { Metadata } from 'next';

import { accountSectionMetadata } from '@/_pages/customer';

export const metadata: Metadata = accountSectionMetadata('fittings');

export { FittingsPage as default } from '@/_pages/fittings';
