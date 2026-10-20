import { describe, expect, it } from 'vitest';

import { catalog } from './catalog';
import { renderEventsDoc } from './render-events-doc';

describe('EVENTS.md', () => {
  // A stale document fails here; `npm --prefix web test -- -u` rewrites it (spec 0015 AC5).
  it('matches the catalog', async () => {
    await expect(renderEventsDoc(catalog)).toMatchFileSnapshot('./EVENTS.md');
  });
});
