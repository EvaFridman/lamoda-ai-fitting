// Entry point of the api process. Sentry hooks into libraries (http, express, Nest, Prisma,
// ioredis) as they load, so it starts first and the server is imported only afterwards: a static
// import would load every module before instrument.ts runs.
import './instrument.js';

await import('./server.js');
