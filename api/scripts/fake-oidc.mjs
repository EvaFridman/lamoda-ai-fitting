// A fake OpenID provider that stands in for Google locally and in tests (spec 0013 N14, plan §11).
// oauth2-mock-server signs real tokens but signs in a fixed user; here `/authorize` first shows a
// form (email and given name), and the tokens and userinfo of that code flow carry what was typed,
// with `email_verified: true`. The same email always gets the same `sub`, so it is the same account.
// Not for production: it accepts any client and secret, and the api refuses it there
// (`assertServerEnv`). It redirects only to localhost or 127.0.0.1, so a link from another site
// cannot carry a code away. Only a dev dependency, so the api's runtime image cannot run it.
//
// Run by the compose service `oidc`: node scripts/fake-oidc.mjs
//   FAKE_OIDC_PORT    port to listen on (default 4010)
//   FAKE_OIDC_ISSUER  the issuer, the browser's address of the server (default
//                     http://localhost:<port>); the api reaches the token and userinfo endpoints
//                     by the service name instead, so it never reads the discovery document.
// e2e start it in-process with startFakeOidc().

import { Events, OAuth2Server } from 'oauth2-mock-server';

// The library's own authorize handler (it issues the code at once) moves here; the form posts to it.
const CONFIRM_PATH = '/authorize/confirm';
// Where a sign-in with a redirect_uri off this machine ends, instead of that address.
const REFUSED_PATH = '/authorize/refused';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const REDIRECT_REFUSED = 'redirect_uri must be an http(s) address on localhost or 127.0.0.1';
// Codes and access tokens whose claims are kept; the oldest go first. A sign-in needs its entry for
// seconds, so this only stops a long-running local server from growing.
const MAX_ENTRIES = 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The longest address SMTP can carry (RFC 5321).
const MAX_EMAIL_LENGTH = 254;

/** A Map that drops its oldest entry beyond MAX_ENTRIES. */
function boundedSet(map, key, value) {
  map.set(key, value);
  if (map.size > MAX_ENTRIES) map.delete(map.keys().next().value);
}

/** Whether a redirect_uri is an http(s) address on this machine. */
function isLocalRedirect(value) {
  if (typeof value !== 'string' || !URL.canParse(value)) return false;
  const url = new URL(value);
  return (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOSTS.has(url.hostname);
}

function sendRefused(res) {
  res.statusCode = 400;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(REDIRECT_REFUSED);
}

function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

/** The login form; every query parameter of the client's request goes along as a hidden field. */
function loginPage(query) {
  const hidden = Object.entries(query)
    .filter(([name, value]) => typeof value === 'string' && name !== 'email' && name !== 'name')
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join('\n      ');
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Fake Google sign-in</title>
    <style>
      body { font: 16px/1.4 system-ui, sans-serif; max-width: 360px; margin: 48px auto; padding: 0 16px; }
      label { display: block; margin: 12px 0 4px; }
      input[type=email], input[type=text] { box-sizing: border-box; width: 100%; padding: 8px; }
      button { margin-top: 16px; padding: 8px 16px; }
    </style>
  </head>
  <body>
    <h1>Fake Google</h1>
    <p>Local development only. Any email signs in as that user.</p>
    <form method="get" action="${CONFIRM_PATH}">
      ${hidden}
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autocomplete="email">
      <label for="name">Given name</label>
      <input id="name" name="name" type="text" required autocomplete="given-name">
      <button type="submit">Sign in</button>
    </form>
  </body>
</html>
`;
}

/**
 * Starts the fake provider. `issuer` defaults to http://localhost:<port>. Resolves with the running
 * oauth2-mock-server; stop it with `server.stop()`.
 */
export async function startFakeOidc({ port = 0, host, issuer } = {}) {
  const server = new OAuth2Server(undefined, undefined, {
    endpoints: { authorize: CONFIRM_PATH },
  });
  await server.issuer.keys.generate('RS256');

  const claimsByCode = new Map();
  const claimsByAccessToken = new Map();
  const service = server.service;

  service.addRoute('GET', '/authorize', (req, res) => {
    if (!isLocalRedirect(req.query.redirect_uri)) {
      sendRefused(res);
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // No form-action: browsers apply it to the redirect after the submit too, which leaves for the
    // client's redirect_uri on another origin.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    );
    res.end(loginPage(req.query));
  });

  service.addRoute('GET', REFUSED_PATH, (_req, res) => sendRefused(res));

  service.on(Events.BeforeWellKnownOpenIdConfiguration, (response) => {
    response.body.authorization_endpoint = new URL('/authorize', server.issuer.url).href;
  });

  // The form's answer: keep the typed claims under the code, or refuse a sign-in without them.
  // The library redirects to `url` whatever happens here, so a redirect_uri off this machine is
  // replaced by the refusal page, and its code gets no claims (so no tokens).
  service.on(Events.BeforeAuthorizeRedirect, ({ url }, req) => {
    if (!isLocalRedirect(url.href)) {
      url.href = new URL(REFUSED_PATH, server.issuer.url).href;
      return;
    }
    const code = url.searchParams.get('code');
    if (code === null) return;
    const query = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const email = (query.get('email') ?? '').trim().toLowerCase();
    const name = (query.get('name') ?? '').trim();
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL.test(email) || name === '') {
      url.searchParams.delete('code');
      url.searchParams.set('error', 'access_denied');
      url.searchParams.set('error_description', 'email and given name are required');
      return;
    }
    boundedSet(claimsByCode, code, {
      sub: email,
      email,
      email_verified: true,
      given_name: name,
      name,
    });
  });

  // The library's /endsession redirects to post_logout_redirect_uri: the same rule.
  service.on(Events.BeforePostLogoutRedirect, ({ url }) => {
    if (!isLocalRedirect(url.href)) url.href = new URL(REFUSED_PATH, server.issuer.url).href;
  });

  // Both the access token and the id token of a code exchange carry the typed claims.
  service.on(Events.BeforeTokenSigning, (token, req) => {
    const claims = claimsByCode.get(req.body?.code);
    if (claims) Object.assign(token.payload, claims);
  });

  // The library answers any code, and other grants (refresh, password, client credentials), with
  // tokens of a fixed user; only a code the form issued, once, gets tokens here.
  service.on(Events.BeforeResponse, (response, req) => {
    if (req.body?.grant_type !== 'authorization_code') {
      response.statusCode = 400;
      response.body = { error: 'unsupported_grant_type' };
      return;
    }
    const code = req.body.code;
    const claims = claimsByCode.get(code);
    if (!claims) {
      response.statusCode = 400;
      response.body = { error: 'invalid_grant' };
      return;
    }
    claimsByCode.delete(code);
    if (typeof response.body.access_token === 'string') {
      boundedSet(claimsByAccessToken, response.body.access_token, claims);
    }
  });

  service.on(Events.BeforeUserinfo, (response, req) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const claims = claimsByAccessToken.get(token);
    if (claims) {
      response.body = claims;
    } else {
      response.statusCode = 401;
      response.body = { error: 'invalid_token' };
    }
  });

  if (issuer) server.issuer.url = issuer;
  // Without an issuer, start() takes http://localhost:<port>.
  await server.start(port, host);
  return server;
}

if (import.meta.main) {
  const port = Number(process.env.FAKE_OIDC_PORT || 4010);
  const server = await startFakeOidc({
    port,
    host: '0.0.0.0',
    issuer: process.env.FAKE_OIDC_ISSUER || undefined,
  });
  process.stdout.write(`fake-oidc: listening on ${port}, issuer ${server.issuer.url}\n`);
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      server.stop().then(() => process.exit(0));
    });
  }
}
