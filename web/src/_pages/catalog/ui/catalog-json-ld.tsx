import 'server-only';

import { getServerEnv } from '@/shared/config/server';
import { jsonLdText } from '@/shared/lib';

import { type CatalogJsonLdInput, catalogJsonLd } from '../model/json-ld';

export type CatalogJsonLdProps = Omit<CatalogJsonLdInput, 'siteUrl'> & {
  // The request's CSP nonce (plan §5, `requestNonce`).
  nonce: string | undefined;
};

// The page's structured data (plan §3.5, O27), rendered per request with the first batch. Set as
// HTML on purpose: React would escape a script's text and break the JSON, and jsonLdText leaves no
// `<` that could end the script.
export function CatalogJsonLd({ nonce, ...props }: CatalogJsonLdProps) {
  const text = jsonLdText(catalogJsonLd({ siteUrl: getServerEnv().SITE_URL, ...props }));
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}
