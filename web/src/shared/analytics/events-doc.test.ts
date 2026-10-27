import { describe, expect, it } from 'vitest';

import { catalog, defineCatalog } from './catalog';
import { renderEventsDoc } from './render-events-doc';

describe('EVENTS.md', () => {
  it('marks an optional property «не всегда» and no other', () => {
    const doc = renderEventsDoc(
      defineCatalog({
        visitsPerMonth: 1,
        sdkPerVisit: 1,
        zones: { shop: { title: 'Магазин', areas: ['shop'], description: '…' } },
        commonEvents: {
          'Element Clicked': { description: '…' },
          'Element Hovered': { description: '…' },
        },
        events: {
          'Shop Sorted': {
            zone: 'shop',
            type: 'interaction',
            description: '…',
            perVisit: 1,
            properties: {
              sort: { kind: 'enum', values: ['price', 'new'] },
              reason: { kind: 'enum', values: ['a', 'b'], optional: true },
              count: { kind: 'number', optional: true },
            },
          },
        },
        elements: {},
      }),
    );

    expect(doc).toContain('`sort`: `price`, `new`<br>');
    expect(doc).toContain('`reason` (не всегда): `a`, `b`');
    expect(doc).toContain('`count` (не всегда): number');
    expect(doc).not.toContain('`sort` (не всегда)');
  });

  // A stale document fails here; `npm --prefix web test -- -u` rewrites it (spec 0015 AC5).
  it('matches the catalog', async () => {
    await expect(renderEventsDoc(catalog)).toMatchFileSnapshot('./EVENTS.md');
  });
});
