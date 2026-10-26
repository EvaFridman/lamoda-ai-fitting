import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  chunkFile,
  chunkKind,
  embeddedText,
  MAX_CHUNK_CHARS,
  specStatus,
  WINDOW_LINES,
  WINDOW_OVERLAP,
} from './chunk.ts';

const HASH = 'a411afbff4e32229fc209f6543e43cf68d826bff';

function chunks(path: string, text: string) {
  return chunkFile({ path, text, blobHash: HASH });
}

function outline(path: string, text: string) {
  return chunks(path, text).map((c) => [c.startLine, c.endLine, c.symbol]);
}

function lines(count: number, make: (index: number) => string = (i) => `line ${i + 1}`) {
  return Array.from({ length: count }, (_, i) => make(i)).join('\n');
}

describe('chunkFile: TypeScript and JavaScript', () => {
  it('makes one chunk per top-level declaration, named by what it declares', () => {
    const text = [
      "import { a } from './a.js';",
      "import b from './b.js';",
      "export { c } from './c.js';",
      '',
      'export const ONE = 1, TWO = 2;',
      '',
      'export function start(): void {',
      '  a();',
      '}',
      '',
      'interface Row {',
      '  id: string;',
      '}',
      '',
      'type Id = string;',
      '',
      'enum Slot {',
      '  Top,',
      '}',
      '',
      'export default { b };',
      '',
    ].join('\n');
    assert.deepEqual(outline('api/src/x.ts', text), [
      [1, 3, 'imports'],
      [5, 5, 'ONE, TWO'],
      [7, 9, 'start'],
      [11, 13, 'Row'],
      [15, 15, 'Id'],
      [17, 19, 'Slot'],
      [21, 21, 'default'],
    ]);
  });

  it('makes one chunk named by both for two statements on one line, so no two share an id', () => {
    const result = chunks('api/src/x.ts', 'const a = 1; const b = 2;\n');
    assert.deepEqual(
      result.map((c) => [c.startLine, c.endLine, c.symbol, c.text]),
      [[1, 1, 'a, b', 'const a = 1; const b = 2;']],
    );
  });

  it('attaches leading comments and JSDoc to their node, not a trailing comment', () => {
    const text = [
      'const a = 1; // about a',
      '',
      '// About b,',
      '/** and more. */',
      'const b = 2;',
    ].join('\n');
    const result = chunks('api/src/x.ts', text);
    assert.deepEqual(
      result.map((c) => [c.startLine, c.endLine, c.symbol]),
      [
        [1, 1, 'a'],
        [3, 5, 'b'],
      ],
    );
    assert.equal(result[1]!.text, '// About b,\n/** and more. */\nconst b = 2;');
  });

  it('names a statement with no declared name by its first line', () => {
    const text = "describe('the cart', () => {\n  it('works', () => {});\n});\n";
    assert.deepEqual(outline('web/src/cart.test.tsx', text), [
      [1, 3, "describe('the cart', () => {"],
    ]);
  });

  it('parses TSX and JavaScript', () => {
    assert.deepEqual(outline('web/src/a.tsx', 'export function A() {\n  return <div />;\n}\n'), [
      [1, 3, 'A'],
    ]);
    assert.deepEqual(outline('scripts/a.mjs', 'export async function main() {}\n'), [
      [1, 1, 'main'],
    ]);
  });

  it('splits a class over 80 lines into its members', () => {
    const body = lines(40, (i) => `    void ${i};`);
    const text = [
      '@Injectable()',
      'export class Big {',
      '  private readonly x = 1;',
      '',
      '  constructor() {}',
      '',
      '  first() {',
      body,
      '  }',
      '',
      '  /** The second. */',
      '  second() {',
      body,
      '  }',
      '}',
    ].join('\n');
    assert.deepEqual(outline('api/src/big.ts', text), [
      [1, 3, 'Big.x'],
      [5, 5, 'Big.constructor'],
      [7, 48, 'Big.first'],
      [50, 93, 'Big.second'],
    ]);
  });

  it('keeps a class of 80 lines or fewer whole', () => {
    const text = `class Small {\n  a() {\n${lines(70, () => '    void 0;')}\n  }\n}\n`;
    assert.deepEqual(outline('api/src/small.ts', text), [[1, 74, 'Small']]);
  });

  it('splits a statement over 120 lines into overlapping windows of 60', () => {
    const text = `export const LIST = [\n${lines(148, (i) => `  ${i},`)}\n];\n`;
    const result = outline('api/src/list.ts', text);
    assert.deepEqual(result, [
      [1, 60, 'LIST'],
      [51, 110, 'LIST'],
      [101, 150, 'LIST'],
    ]);
  });

  it('splits a statement over 6000 characters even when it is short', () => {
    const long = `  '${'x'.repeat(200)}',`;
    const text = `export const LIST = [\n${lines(40, () => long)}\n];\n`;
    const result = chunks('api/src/list.ts', text);
    // Each window stops before 6000 characters and shares a quarter of itself with the one before.
    assert.deepEqual(
      result.map((c) => [c.startLine, c.endLine, c.symbol]),
      [
        [1, 30, 'LIST'],
        [24, 42, 'LIST'],
      ],
    );
    for (const chunk of result) assert.ok(chunk.text.length <= MAX_CHUNK_CHARS);
  });

  it('keeps a single line over 6000 characters as one window and moves on', () => {
    const text = `export const A = [\n  '${'x'.repeat(7000)}',\n${lines(130, (i) => `  ${i},`)}\n];\n`;
    const result = chunks('api/src/a.ts', text);
    assert.deepEqual(result[1]!.startLine, 2);
    assert.deepEqual(result[1]!.endLine, 2);
    assert.equal(result.at(-1)!.endLine, 133);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i]!.startLine > result[i - 1]!.startLine);
    }
  });

  it('falls back to windows for a file of comments only', () => {
    assert.deepEqual(outline('api/src/empty.ts', '// nothing here\n// yet\n'), [
      [1, 2, '// nothing here'],
    ]);
  });

  it('puts directives at the top with the piece after them', () => {
    const text =
      "// Header.\n'use client';\n\nimport { a } from './a';\n\nexport function B() {}\n";
    assert.deepEqual(outline('web/src/b.tsx', text), [
      [1, 4, 'imports'],
      [6, 6, 'B'],
    ]);
    assert.deepEqual(outline('web/src/c.tsx', "'use client';\n\nexport const C = 1;\n"), [
      [1, 3, 'C'],
    ]);
  });

  it('keeps comments after the last statement with the last piece', () => {
    assert.deepEqual(outline('api/src/x.ts', 'export const A = 1;\n\n// The end.\n'), [
      [1, 3, 'A'],
    ]);
  });

  it('shares fewer lines between windows cut short by long lines', () => {
    const text = `export const A = [\n${lines(100, () => `  '${'x'.repeat(1500)}',`)}\n];\n`;
    const result = chunks('api/src/a.ts', text);
    // Three or four lines fit a window; a quarter of that is one line shared at most.
    assert.ok(result.length <= 40, `${result.length}`);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i]!.startLine >= result[i - 1]!.endLine);
    }
  });
});

describe('chunkFile: Markdown', () => {
  const doc = [
    '# 0018 page cache',
    '',
    'Status: done (2026-10-24)',
    '',
    '## Acceptance criteria',
    '',
    '### Page cache',
    '',
    'AC1. Cached.',
    '',
    '```md',
    '# not a heading',
    '```',
    '',
    '##### Deeper stays inside',
    '',
    'Text.',
    '',
    '## Notes',
    '### Empty',
    '### Full',
    'Something.',
  ].join('\n');

  it('makes one chunk per section of # to ####, named by its heading path', () => {
    assert.deepEqual(outline('specs/0018-page-cache/spec.md', doc), [
      [1, 4, '0018 page cache'],
      [7, 18, '0018 page cache › Acceptance criteria › Page cache'],
      [21, 22, '0018 page cache › Notes › Full'],
    ]);
  });

  it('names text before the first heading by its first line', () => {
    assert.deepEqual(outline('README.md', '\nIntro text.\n\n# Title\nBody.\n'), [
      [1, 3, 'Intro text.'],
      [4, 5, 'Title'],
    ]);
  });

  it('drops a skipped level from the heading path', () => {
    assert.deepEqual(outline('README.md', '# A\n### C\nBody.\n'), [[2, 3, 'A › C']]);
  });

  it('splits a long section at paragraphs', () => {
    const paragraph = 'word '.repeat(300).trim();
    const text = `# Long\n\n${Array.from({ length: 6 }, () => paragraph).join('\n\n')}\n`;
    const result = chunks('README.md', text);
    assert.equal(result.length, 2);
    for (const chunk of result) {
      assert.ok(chunk.text.length <= MAX_CHUNK_CHARS, `${chunk.text.length}`);
      assert.equal(chunk.symbol, 'Long');
    }
    assert.equal(result[0]!.startLine, 1);
    assert.equal(result[1]!.startLine, result[0]!.endLine + 1);
    assert.equal(result[1]!.endLine, 13);
  });

  it('splits a paragraph over the limit at its lines', () => {
    const row = `| ${'cell '.repeat(40)}|`;
    const text = `# Table\n\n${lines(60, () => row)}\n`;
    const result = chunks('README.md', text);
    assert.ok(result.length > 1);
    for (const chunk of result) assert.ok(chunk.text.length <= MAX_CHUNK_CHARS);
    assert.equal(result.at(-1)!.endLine, 62);
  });

  it('splits a long list without blank lines between its items, never inside one', () => {
    const item = (i: number) => [`- Item ${i}: ${'text '.repeat(40)}`, `  ${'more '.repeat(40)}`];
    const text = `# Conventions\n\n${Array.from({ length: 40 }, (_, i) => item(i))
      .flat()
      .join('\n')}\n`;
    const result = chunks('CLAUDE.md', text);
    assert.ok(result.length > 1);
    for (const chunk of result.slice(1)) assert.match(chunk.text, /^- Item \d+:/);
    for (const chunk of result) assert.ok(chunk.text.length <= MAX_CHUNK_CHARS);
    assert.equal(result.at(-1)!.endLine, 82);
  });

  it('sees no heading inside a ~~~ fence', () => {
    assert.deepEqual(outline('README.md', '# A\n~~~\n# not\n~~~\nText.\n'), [[1, 5, 'A']]);
  });

  it('names front matter as such', () => {
    const text = '---\npaths: ["deploy/**"]\n---\n\n# Deploys\nText.\n';
    assert.deepEqual(outline('.claude/rules/deploy.md', text), [
      [1, 4, 'front matter'],
      [5, 6, 'Deploys'],
    ]);
  });
});

describe('chunkFile: the repository', () => {
  it('leaves no non-blank line of a real file outside every chunk', () => {
    const root = new URL('../../../', import.meta.url);
    for (const path of [
      'CLAUDE.md',
      'specs/principles.md',
      'tools/code-rag/src/chunk.ts',
      'api/src/fittings/fittings.service.ts',
      'web/src/shared/api/client-fetch.ts',
      '.github/workflows/ci.yml',
    ]) {
      const text = readFileSync(new URL(path, root), 'utf8');
      const covered = new Set<number>();
      for (const chunk of chunks(path, text)) {
        for (let line = chunk.startLine; line <= chunk.endLine; line++) covered.add(line);
      }
      text.split('\n').forEach((line, index) => {
        if (line.trim() !== '' && !/^#{1,4}\s/.test(line)) {
          assert.ok(covered.has(index + 1), `${path}:${index + 1}`);
        }
      });
    }
  });
});

describe('chunkFile: other files', () => {
  it('cuts windows of 60 lines with 10 overlapping, named by their first line', () => {
    const text = `${lines(130, (i) => (i === 50 ? '' : `key${i}: value`))}\n`;
    const result = outline('deploy/compose/infra.yml', text);
    const step = WINDOW_LINES - WINDOW_OVERLAP;
    assert.deepEqual(result, [
      [1, 60, 'key0: value'],
      [1 + step, 60 + step, 'key51: value'],
      [1 + 2 * step, 130, 'key100: value'],
    ]);
  });

  it('cuts the symbol to 80 characters', () => {
    const [chunk] = chunks('web/src/a.scss', `${'.a'.repeat(60)} {}\n`);
    assert.equal(chunk!.symbol.length, 80);
  });

  it('chunks a Dockerfile by lines', () => {
    assert.deepEqual(outline('api/Dockerfile', 'FROM node:26\nRUN npm ci\n'), [
      [1, 2, 'FROM node:26'],
    ]);
  });

  it('answers nothing for an empty file', () => {
    assert.deepEqual(chunks('deploy/a.sh', ''), []);
  });
});

describe('chunk fields', () => {
  it('fills every field and derives the id from the path, the lines and the blob', () => {
    const [chunk] = chunks('api/src/x.ts', 'export const A = 1;\n');
    assert.deepEqual(
      { ...chunk, id: undefined },
      {
        id: undefined,
        path: 'api/src/x.ts',
        startLine: 1,
        endLine: 1,
        kind: 'code',
        symbol: 'A',
        specStatus: null,
        text: 'export const A = 1;',
        blobHash: HASH,
      },
    );
    assert.match(chunk!.id, /^[0-9a-f]{64}$/);
    const [other] = chunkFile({
      path: 'api/src/x.ts',
      text: 'export const A = 1;\n',
      blobHash: 'b',
    });
    assert.notEqual(other!.id, chunk!.id);
    assert.equal(chunks('api/src/x.ts', 'export const A = 1;\n')[0]!.id, chunk!.id);
  });

  it('puts the path and the symbol on the embedded text first line', () => {
    const [chunk] = chunks('api/src/x.ts', 'export const A = 1;\n');
    assert.equal(embeddedText(chunk!), 'api/src/x.ts A\nexport const A = 1;');
  });
});

describe('chunkKind', () => {
  it('tells tests, specs, docs, deploy files and code apart', () => {
    for (const [path, kind] of [
      ['api/src/a.spec.ts', 'test'],
      ['api/test/a.e2e-spec.ts', 'test'],
      ['web/src/a.test.ts', 'test'],
      ['web/src/a.test.tsx', 'test'],
      ['specs/0021-investigator/plan.md', 'spec'],
      ['specs/backlog.md', 'spec'],
      ['CLAUDE.md', 'doc'],
      ['.claude/rules/deploy.md', 'doc'],
      ['deploy/README.md', 'deploy'],
      ['deploy/nginx/site.conf.template', 'deploy'],
      ['.github/workflows/ci.yml', 'deploy'],
      ['scripts/check-web-bundle.mjs', 'deploy'],
      ['api/Dockerfile', 'deploy'],
      ['docker-compose.yml', 'deploy'],
      ['api/src/a.ts', 'code'],
      ['web/src/a.module.scss', 'code'],
      ['.env.example', 'code'],
    ] as const) {
      assert.equal(chunkKind(path), kind, path);
    }
  });
});

describe('specStatus', () => {
  it('is history for a done spec, binding for any other status or none', () => {
    assert.equal(
      specStatus('specs/0014-catalog/plan.md', '# P\n\nStatus: done (2026-10-22).'),
      'history',
    );
    assert.equal(specStatus('specs/0014-catalog/spec.md', 'Status: done: all 24 pass'), 'history');
    assert.equal(
      specStatus('specs/0021-investigator/plan.md', 'Status: draft (2026-10-25)'),
      'binding',
    );
    assert.equal(specStatus('specs/0021-investigator/tasks.md', 'Status: doneish'), 'binding');
    assert.equal(specStatus('specs/0021-investigator/notes.md', 'No status here.'), 'binding');
  });

  it('is binding for the backlog and the principles whatever they say', () => {
    assert.equal(specStatus('specs/backlog.md', 'Status: done'), 'binding');
    assert.equal(specStatus('specs/principles.md', 'Status: done'), 'binding');
  });

  it('is null outside specs/', () => {
    assert.equal(specStatus('CLAUDE.md', 'Status: done'), null);
  });

  it('reaches every chunk of the file', () => {
    const result = chunks(
      'specs/0001-bootstrap/plan.md',
      '# Plan\n\nStatus: done\n\n## A\nText.\n',
    );
    assert.deepEqual(
      result.map((c) => c.specStatus),
      ['history', 'history'],
    );
  });
});
