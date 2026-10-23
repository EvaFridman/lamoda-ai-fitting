import { fileURLToPath } from 'node:url';

import { bundleWorkflowCode } from '@temporalio/worker';
import { describe, expect, it } from 'vitest';

describe('temporal code', () => {
  // The worker bundles workflow code for Temporal's sandbox when it starts. A workflow that imports
  // something the sandbox forbids (Node built-ins, Nest, I/O) fails here instead of on the server.
  it('workflows bundle for the sandbox', { timeout: 60_000 }, async () => {
    const { code } = await bundleWorkflowCode({
      workflowsPath: fileURLToPath(new URL('./index.ts', import.meta.url)),
      logger: {
        log: () => {},
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });
    expect(code).toContain('async function deleteFiles');
    expect(code).toContain('async function deleteExpiredAuthRows');
    expect(code).toContain('async function housekeeping');
    expect(code).toContain('async function generateFitting');
  });
});
