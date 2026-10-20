import { describe, expect, it } from 'vitest';

import type { Catalog } from './catalog';
import { renderEventsDoc } from './render-events-doc';

const catalog: Catalog = {
  visitsPerMonth: 100_000,
  sdkPerVisit: 1.5,
  zones: {
    beta: { title: 'Бета', areas: ['b1', 'b2'], description: 'Вторая зона.' },
    alpha: { title: 'Альфа', areas: ['a1'], description: 'Первая зона.' },
    empty: { title: 'Пустая', areas: ['e1'], description: 'Без записей.' },
  },
  commonEvents: {
    'Element Clicked': { description: 'Клик.' },
    'Element Hovered': { description: 'Наведение.' },
  },
  events: {
    'Alpha Event': {
      zone: 'alpha',
      type: 'interaction',
      description: 'Left | right\nsecond line',
      perVisit: 0.1,
      properties: {
        kind: { kind: 'enum', values: ['a', 'b'] },
        count: { kind: 'number' },
        flag: { kind: 'boolean' },
      },
    },
    'Alpha Plain': {
      zone: 'alpha',
      type: 'conversion',
      description: 'Plain.',
      perVisit: 0.2,
      properties: {},
    },
    'Beta Event': {
      zone: 'beta',
      type: 'service',
      description: 'Beta.',
      perVisit: 0,
      properties: { only: { kind: 'boolean' } },
    },
  },
  elements: {
    'alpha.button': {
      zone: 'alpha',
      type: 'navigation',
      description: 'No props.',
      clicksPerVisit: 0.1,
      hoversPerVisit: 0.0004,
    },
    'alpha.field': {
      zone: 'alpha',
      type: 'interaction',
      description: 'Pipe | here',
      clicksPerVisit: 0.2,
      hoversPerVisit: 0.0006,
      properties: { size: { kind: 'enum', values: ['s', 'm'] } },
    },
  },
};

const doc = renderEventsDoc(catalog);

function section(title: string): string {
  const start = doc.indexOf(`## ${title}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = doc.indexOf('\n## ', start + 1);
  return doc.slice(start, next === -1 ? undefined : next);
}

function row(text: string, name: string): string {
  const line = text.split('\n').find((l) => l.startsWith(`| \`${name}\``));
  expect(line).toBeDefined();
  return line!;
}

describe('renderEventsDoc properties', () => {
  it('renders enum values and number/boolean kinds, joined with <br>', () => {
    expect(row(doc, 'Alpha Event')).toContain(
      '`kind`: `a`, `b`<br>`count`: number<br>`flag`: boolean',
    );
  });

  it('prints a dash for an event with empty properties', () => {
    expect(row(doc, 'Alpha Plain')).toContain('| — |');
  });

  it('prints a dash for an element without properties', () => {
    expect(row(doc, 'alpha.button')).toContain('| — |');
  });

  it('renders an element with properties', () => {
    expect(row(doc, 'alpha.field')).toContain('`size`: `s`, `m`');
  });
});

describe('renderEventsDoc table cells', () => {
  it('escapes a pipe and flattens a newline so the row stays one row', () => {
    const line = row(doc, 'Alpha Event');
    expect(line).toContain('Left \\| right second line');
    expect(line.endsWith(' |')).toBe(true);
    expect(doc).not.toContain('right\nsecond');
  });

  it('escapes a pipe in an element description', () => {
    expect(row(doc, 'alpha.field')).toContain('Pipe \\| here');
  });

  it.each([
    ['CRLF', 'one\r\ntwo', 'one two'],
    ['a lone CR', 'one\rtwo', 'one two'],
  ])('keeps a description with %s in one table row', (_label, description, flat) => {
    const text = renderEventsDoc({
      ...catalog,
      events: {
        'Alpha Plain': {
          zone: 'alpha',
          type: 'conversion',
          description,
          perVisit: 0.2,
          properties: {},
        },
      },
      elements: {
        'alpha.button': {
          zone: 'alpha',
          type: 'navigation',
          description,
          clicksPerVisit: 0.1,
          hoversPerVisit: 0,
        },
      },
    });
    expect(text).not.toMatch(/\r/);
    for (const name of ['Alpha Plain', 'alpha.button']) {
      const line = row(text, name);
      expect(line).toContain(`| ${flat} |`);
      expect(line.endsWith(' |')).toBe(true);
    }
  });
});

describe('renderEventsDoc numbers', () => {
  it('groups thousands with a space', () => {
    const text = renderEventsDoc({ ...catalog, visitsPerMonth: 12_345 });
    expect(text).toContain('при 12 345 визитах');
  });

  it('uses a decimal comma and rounds per visit to 3 decimals', () => {
    const text = renderEventsDoc({
      ...catalog,
      events: {
        'Alpha Plain': {
          zone: 'alpha',
          type: 'conversion',
          description: 'x',
          perVisit: 0.12345,
          properties: {},
        },
      },
    });
    expect(row(text, 'Alpha Plain')).toContain('| 0,123 |');
  });

  it('does not print floating sums with noise', () => {
    expect(doc).not.toContain('0,30000000000000004');
    expect(doc).not.toMatch(/\d,\d{4,}/);
    expect(section('Бюджет')).toContain('| События каталога | 0,3 | 30 000 |');
  });

  it('rounds the month to whole numbers', () => {
    const text = renderEventsDoc({ ...catalog, visitsPerMonth: 3 });
    expect(text).toMatch(/\| События каталога \| 0,3 \| 1 \|/);
  });

  it('prints the element rates', () => {
    expect(row(doc, 'alpha.button')).toContain('| 0,1 | 0 |');
    expect(row(doc, 'alpha.field')).toContain('| 0,2 | 0,001 |');
  });
});

describe('renderEventsDoc zones', () => {
  it('prints "Нет." for a zone without events and elements', () => {
    const empty = section('Пустая');
    expect(empty).toMatch(/### События\n\nНет\.\n\n### Элементы\n\nНет\./);
  });

  it('prints "Нет." only for the missing list of a zone', () => {
    const beta = section('Бета');
    expect(beta).toMatch(/### Элементы\n\nНет\./);
    expect(beta).not.toMatch(/### События\n\nНет\./);
  });

  it('keeps the catalog order of zones', () => {
    const order = ['Бета', 'Альфа', 'Пустая'].map((t) => doc.indexOf(`## ${t} (`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('keeps the catalog order of entries inside a zone', () => {
    const alpha = section('Альфа');
    expect(alpha.indexOf('`Alpha Event`')).toBeLessThan(alpha.indexOf('`Alpha Plain`'));
    expect(alpha.indexOf('`alpha.button`')).toBeLessThan(alpha.indexOf('`alpha.field`'));
  });

  it('shows an entry only under its own zone', () => {
    expect(section('Бета')).toContain('`Beta Event`');
    expect(section('Бета')).not.toContain('Alpha');
    expect(section('Альфа')).not.toContain('Beta Event');
    expect(section('Пустая')).not.toContain('Alpha');
  });

  it.each(['Two\nlines', 'Two\r\nlines', 'Two\rlines'])(
    'renders a zone title with a newline (%j) as one heading line',
    (title) => {
      const text = renderEventsDoc({
        ...catalog,
        zones: { alpha: { title, areas: ['a1'], description: 'Первая зона.' } },
        events: {},
        elements: {},
      });
      const headings = text
        .split('\n')
        .filter((l) => l.startsWith('## ') && l.includes('(`alpha`)'));
      expect(headings).toEqual(['## Two lines (`alpha`)']);
      expect(text).not.toMatch(/\r/);
    },
  );

  it('lists the zone areas', () => {
    expect(section('Бета')).toContain('Области: `b1`, `b2`.');
  });
});

describe('renderEventsDoc budget', () => {
  it('shows each part and the total', () => {
    const budget = section('Бюджет');
    expect(budget).toContain('| События каталога | 0,3 | 30 000 |');
    expect(budget).toContain('| Клики по элементам (`Element Clicked`) | 0,3 | 30 000 |');
    expect(budget).toContain('| Наведения на элементы (`Element Hovered`) | 0,001 | 100 |');
    expect(budget).toMatch(/\| Собственные события SDK[^|]*\| 1,5 \| 150 000 \|/);
    expect(budget).toContain('| **Всего** | **2,101** | **210 100** |');
  });

  it('shows the share of the free plan and the threshold', () => {
    const budget = section('Бюджет');
    expect(budget).toContain('Это 21 % от 1 000 000 событий в месяц');
    expect(budget).toContain('порог — 80 % (800 000)');
  });
});

describe('renderEventsDoc ending', () => {
  it('ends with exactly one newline', () => {
    expect(doc.endsWith('\n')).toBe(true);
    expect(doc.endsWith('\n\n')).toBe(false);
  });
});
