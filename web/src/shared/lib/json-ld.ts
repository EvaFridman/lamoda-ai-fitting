// JSON's escape of `<`: a backslash, then u003c.
const ESCAPED_LESS_THAN = '\\' + 'u003c';

// JSON for a `<script type="application/ld+json">`: every `<` escaped, so no text from the api
// ("</script>") can end the script early (spec 0014 plan §3.5).
export function jsonLdText(data: object): string {
  return JSON.stringify(data).replaceAll('<', ESCAPED_LESS_THAN);
}
