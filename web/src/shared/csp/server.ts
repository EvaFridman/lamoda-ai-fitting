import 'server-only';

// web's Content Security Policy (spec 0014 plan §5): built by `proxy.ts`, its nonce read by the
// server components that render a script.
export { requestNonce } from './nonce';
export { contentSecurityPolicy, newNonce, NONCE_HEADER } from './policy';
