// The proxy abroad that every request to OpenAI goes through (spec 0019 A73): OpenAI blocks the
// server's region, so OpenAiClient (ai/) sends through undici's ProxyAgent (`CONNECT
// api.openai.com:443`, the TLS inside the tunnel is OpenAI's own). Nothing else in the api uses it.
// Here, not in ai/, since the env schema checks `OPENAI_PROXY_URL` with it.
export interface OpenAiProxy {
  // The proxy's own address, no credentials: what an error or a log line may name.
  origin: string;
  // The `Proxy-Authorization` value (basic auth); never logged.
  token: string;
}

// Letters and digits only: the value goes into the sourced .env (cd.yml's format check) and into
// the URL without percent-encoding.
const CREDENTIAL = /^[A-Za-z0-9]+$/;

// `OPENAI_PROXY_URL`, http://<user>:<password>@<host>:<port>, or null when it has another shape.
// The port is required and not 80 (the URL parser drops a default port); cd.yml's format check
// refuses the same. Never throws, so no message carries the value with its password.
export function parseOpenAiProxyUrl(value: string): OpenAiProxy | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || url.port === '' || url.pathname !== '/') return null;
  if (url.search !== '' || url.hash !== '') return null;
  if (!CREDENTIAL.test(url.username) || !CREDENTIAL.test(url.password)) return null;
  const credentials = Buffer.from(`${url.username}:${url.password}`).toString('base64');
  return { origin: url.origin, token: `Basic ${credentials}` };
}
