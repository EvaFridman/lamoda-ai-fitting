import type { Metadata } from 'next';

import { accountSectionMetadata } from '@/_pages/customer';

export const metadata: Metadata = accountSectionMetadata('photos');

export { PhotosPage as default } from '@/_pages/photos';
