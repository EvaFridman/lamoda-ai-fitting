// Entry point of the backup job (spec 0012, the `backup` image). Sentry starts first, before the
// job's modules load (see src/main.ts).
import '../instrument.js';

await import('./run.js');
