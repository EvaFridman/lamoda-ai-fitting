import 'server-only';

import { getServerEnv } from '@/shared/config/server';
import { jsonLdText } from '@/shared/lib';

import { productJsonLd, type ProductJsonLdInput } from '../model/json-ld';

export type ProductJsonLdProps = Omit<ProductJsonLdInput, 'siteUrl'> & {
  // The request's CSP nonce (0014 plan §5, `requestNonce`).
  nonce: string | undefined;
};

// The page's structured data (spec 0019 plan §8, AC22), rendered per request. Set as HTML on
// purpose, as the catalog's: React would escape a script's text and break the JSON, and jsonLdText
// leaves no `<` that could end the script.
export function ProductJsonLd({ nonce, ...props }: ProductJsonLdProps) {
  const text = jsonLdText(productJsonLd({ siteUrl: getServerEnv().SITE_URL, ...props }));
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}
