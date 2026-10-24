// The deploy's check of OpenAI (spec 0019 A73), run by deploy/scripts/deploy.sh inside the new api
// container before the warm-up and the switch: `node dist/ai/check-openai.js`. GET /v1/models with
// the key through the proxy, by the same client the checks and the generation use, so a missing
// or wrong key, a proxy down or refusing, or OpenAI's region block stops the deploy instead of the
// first fitting. Exit 0 on a 200, else 1. Prints what failed (the operation, the status, OpenAI's
// `error.code`), never the key or the proxy's address. Not Sentry: the deploy's log is where it is
// read.
import { pino } from 'pino';

import { validateEnv } from '../config/env.js';
import { AiProviderError } from './ai-provider.error.js';
import { OpenAiClient } from './openai-client.js';
import { parseOpenAiProxyUrl } from '../config/openai-proxy-url.js';

// Every attempt of the client together (three for a network error, a 429 or a 5xx).
const CHECK_TIMEOUT_MS = 15_000;

async function check(): Promise<number> {
  // Plain JSON lines, as the backup job's: no Nest context is built.
  const logger = pino({ level: 'info', base: { job: 'check-openai' } });
  let env;
  try {
    env = validateEnv(process.env);
  } catch (error) {
    // validateEnv names the variables, never their values.
    logger.error((error as Error).message);
    return 1;
  }
  const proxy = parseOpenAiProxyUrl(env.OPENAI_PROXY_URL);
  if (env.OPENAI_API_KEY === '' || proxy === null) {
    logger.error('OpenAI check: OPENAI_API_KEY and OPENAI_PROXY_URL must be set');
    return 1;
  }
  const client = new OpenAiClient({
    apiKey: env.OPENAI_API_KEY,
    proxy,
    logger: { warn: (message) => logger.warn(message), error: (message) => logger.error(message) },
  });
  try {
    await client.listModels({ signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
  } catch (error) {
    // An AiProviderError's message holds only the operation, the reason, the status, the code and
    // the request id; anything else is named by its class only.
    logger.error(
      error instanceof AiProviderError
        ? `OpenAI check failed: ${error.message}`
        : `OpenAI check failed: ${error instanceof Error ? error.name : 'unknown error'}`,
    );
    return 1;
  }
  logger.info('OpenAI check passed: GET /v1/models answered 200 through the proxy');
  return 0;
}

process.exitCode = await check();
