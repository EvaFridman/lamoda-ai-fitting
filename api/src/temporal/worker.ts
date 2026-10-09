// Entry point of the temporal-worker process (same image as the api, different command). Sentry
// starts first, before the worker's modules load (see src/main.ts).
import '../instrument.js';

await import('./run-worker.js');
