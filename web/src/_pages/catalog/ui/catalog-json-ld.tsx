import 'server-only';

import { getServerEnv } from '@/shared/config/server';

import { type CatalogJsonLdInput, catalogJsonLd, jsonLdText } from '../model/json-ld';

export type CatalogJsonLdProps = Omit<CatalogJsonLdInput, 'siteUrl'>;

// The page's structured data (plan §3.5, O27), rendered per request with the first batch. Set as
// HTML on purpose: React would escape a script's text and break the JSON, and jsonLdText leaves no
// `<` that could end the script.
export function CatalogJsonLd(props: CatalogJsonLdProps) {
  const text = jsonLdText(catalogJsonLd({ siteUrl: getServerEnv().SITE_URL, ...props }));
  // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: text }} />;
}
