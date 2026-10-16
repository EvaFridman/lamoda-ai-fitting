import type { Connection } from '@temporalio/client';
import { describe, expect, it, vi } from 'vitest';

import { TemporalClientModule } from './temporal-client.module.js';
import type { WorkflowStarter } from './workflow-starter.js';

describe('TemporalClientModule.onApplicationShutdown', () => {
  it('drains the starter before it closes the connection', async () => {
    const order: string[] = [];
    let finishDrain: () => void = () => {};
    const drain = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          order.push('drain started');
          finishDrain = () => {
            order.push('drain ended');
            resolve();
          };
        }),
    );
    const close = vi.fn(() => {
      order.push('close');
      return Promise.resolve();
    });
    const module = new TemporalClientModule(
      { close } as unknown as Connection,
      { drain } as unknown as WorkflowStarter,
    );

    const destroying = module.onApplicationShutdown();
    await Promise.resolve();
    expect(close).not.toHaveBeenCalled();

    finishDrain();
    await destroying;

    expect(order).toEqual(['drain started', 'drain ended', 'close']);
  });
});
