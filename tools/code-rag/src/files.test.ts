import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chunkFile } from './chunk.ts';
import {
  findSecretLine,
  isIndexablePath,
  listTrackedFiles,
  MAX_FILE_BYTES,
  parseCatFileBatch,
  parseLsFiles,
  readBlobs,
  selectFiles,
  type TrackedFile,
} from './files.ts';

const HASH = 'a411afbff4e32229fc209f6543e43cf68d826bff';
const BASE64URL = ['Ab3_dEf-GhIjKlMn', 'OpQrStUvWxYz', '0123456789'].join('');

function file(path: string, size = 100, mode = '100644', stage = 0): TrackedFile {
  return { path, mode, blobHash: HASH, size, stage };
}

function reasonOf(path: string, size?: number, mode?: string) {
  const { included, skipped } = selectFiles([file(path, size, mode)]);
  return included.length === 1 ? 'included' : skipped[0]?.reason;
}

describe('parseLsFiles', () => {
  it('reads the mode, the hash, the size, the stage and the path of each entry', () => {
    const output = [
      `100644 ${HASH} 98447 0 CLAUDE.md`,
      `100755 ${HASH} 12 0 scripts/a b.sh`,
      `120000 ${HASH} 7 0 specs/link.md`,
      `160000 ${HASH} - 0 vendor/sub`,
      `100644 ${HASH} 5 2 api/src/conflict.ts`,
      '',
    ].join('\0');
    assert.deepEqual(parseLsFiles(output), [
      { path: 'CLAUDE.md', mode: '100644', blobHash: HASH, size: 98447, stage: 0 },
      { path: 'scripts/a b.sh', mode: '100755', blobHash: HASH, size: 12, stage: 0 },
      { path: 'specs/link.md', mode: '120000', blobHash: HASH, size: 7, stage: 0 },
      { path: 'vendor/sub', mode: '160000', blobHash: HASH, size: 0, stage: 0 },
      { path: 'api/src/conflict.ts', mode: '100644', blobHash: HASH, size: 5, stage: 2 },
    ]);
  });

  it('parses what this git prints for the repository', () => {
    const files = listTrackedFiles(fileURLToPath(new URL('../../..', import.meta.url)));
    const claude = files.find((f) => f.path === 'CLAUDE.md');
    assert.ok(claude && claude.mode === '100644' && claude.stage === 0 && claude.size > 0);
    assert.match(claude.blobHash, /^[0-9a-f]{40}$/);
  });

  it('answers nothing for empty output', () => {
    assert.deepEqual(parseLsFiles(''), []);
  });

  it('refuses an entry of another shape', () => {
    assert.throws(() => parseLsFiles('CLAUDE.md\0'), /Unexpected git ls-files entry/);
  });
});

describe('parseCatFileBatch', () => {
  it("reads each blob's text by its hash, newlines and UTF-8 included", () => {
    const text = 'Привет\nworld\n';
    const output = Buffer.concat([
      Buffer.from(`${HASH} blob ${Buffer.byteLength(text)}\n${text}\n`),
      Buffer.from(`${'b'.repeat(40)} blob 0\n\n`),
    ]);
    assert.deepEqual(
      parseCatFileBatch(output),
      new Map([
        [HASH, text],
        ['b'.repeat(40), ''],
      ]),
    );
  });

  it('refuses a missing object and a cut output', () => {
    assert.throws(() => parseCatFileBatch(Buffer.from(`${HASH} missing\n`)), /Unexpected/);
    assert.throws(() => parseCatFileBatch(Buffer.from(`${HASH} blob 10\nshort\n`)), /Truncated/);
  });
});

describe('readBlobs', () => {
  it("reads the commit's content, not the index's or the working tree's", () => {
    const root = fileURLToPath(new URL('../../..', import.meta.url));
    const claude = listTrackedFiles(root).find((f) => f.path === 'CLAUDE.md')!;
    const committed = execFileSync('git', ['show', 'HEAD:CLAUDE.md'], {
      cwd: root,
      encoding: 'utf8',
    });
    const blobs = readBlobs(root, [claude.blobHash, claude.blobHash]);
    assert.equal(blobs.size, 1);
    assert.equal(blobs.get(claude.blobHash), committed);
  });

  it('refuses a hash git does not have', () => {
    const root = fileURLToPath(new URL('../../..', import.meta.url));
    assert.throws(() => readBlobs(root, ['0'.repeat(40)]), /Unexpected git cat-file header/);
  });

  it('reads nothing for no hashes', () => {
    assert.deepEqual(readBlobs('/nonexistent', []), new Map());
  });
});

describe('selectFiles', () => {
  it('includes the code, the docs, the specs and the deploy files', () => {
    for (const path of [
      'api/src/fittings/fittings.service.ts',
      'api/prisma/schema.prisma',
      'api/prisma/migrations/20261001_init/migration.sql',
      'api/test/access-markers.e2e-spec.ts',
      'api/scripts/fake-oidc.mjs',
      'web/src/shared/ui/button/button.module.scss',
      'web/app/layout.tsx',
      'web/next.config.ts',
      'web/proxy.ts',
      'web/instrumentation.ts',
      'web/instrumentation-client.ts',
      'web/sentry.options.ts',
      'specs/0021-investigator/plan.md',
      'specs/backlog.md',
      'CLAUDE.md',
      'CONTRIBUTING.md',
      'README.md',
      'api/README.md',
      'web/README.md',
      '.claude/rules/analytics.md',
      'deploy/nginx/site.conf.template',
      'deploy/ansible/base.yml',
      '.github/workflows/ci.yml',
      'scripts/check-web-bundle.mjs',
      'api/Dockerfile',
      'web/Dockerfile',
      'docker-compose.yml',
      '.env.example',
    ]) {
      assert.equal(reasonOf(path), 'included', path);
    }
  });

  it('never includes environment files, even if tracked', () => {
    for (const path of ['.env', '.env.local', 'api/.env', 'deploy/.env.production']) {
      assert.notEqual(reasonOf(path), 'included', path);
    }
    for (const path of [
      'deploy/compose/.env.prod.yml',
      'scripts/.env.local.json',
      'specs/.env.md',
      'deploy/.env.example',
    ]) {
      assert.equal(reasonOf(path), 'excluded', path);
    }
  });

  it('reads only regular files, never a symlink or a submodule', () => {
    assert.equal(reasonOf('scripts/run.sh', 100, '100755'), 'included');
    assert.equal(reasonOf('specs/notes.md', 7, '120000'), 'mode');
    assert.equal(reasonOf('deploy/x.conf', 7, '120000'), 'mode');
    assert.equal(reasonOf('api/src/vendor', 0, '160000'), 'mode');
  });

  it('leaves out files outside the included places', () => {
    for (const path of [
      'package.json',
      'eslint.config.mjs',
      'api/package.json',
      'web/package.json',
      'web/vitest.config.mts',
      '.claude/agents/investigator.md',
      '.claude/hooks/main-rules.mjs',
      '.claude/settings.json',
      '.mcp.json',
      'tools/code-rag/src/files.ts',
      '.rag/index.sqlite',
      'specs-old/a.md',
    ]) {
      assert.equal(reasonOf(path), 'outside', path);
    }
  });

  it('excludes lock files, generated code, snapshots and media', () => {
    for (const path of [
      'package-lock.json',
      'api/package-lock.json',
      'deploy/yarn.lock',
      'api/src/generated/prisma/client.ts',
      'api/openapi.json',
      'api/validation-codes.json',
      'web/src/shared/analytics/EVENTS.md',
      'web/src/shared/csp/shell-script-hashes.json',
      'api/seed-media/products/a.webp',
    ]) {
      const reason = reasonOf(path);
      assert.ok(reason === 'excluded' || reason === 'outside', `${path}: ${reason}`);
    }
    assert.equal(reasonOf('api/src/generated/prisma/client.ts'), 'excluded');
    assert.equal(reasonOf('deploy/yarn.lock'), 'excluded');
  });

  it('excludes the third-party skills', () => {
    for (const path of [
      '.claude/skills/prisma-cli/SKILL.md',
      '.claude/skills/temporal-developer/SKILL.md',
    ]) {
      assert.notEqual(reasonOf(path), 'included', path);
    }
  });

  it('reads only whitelisted extensions', () => {
    for (const path of [
      'web/src/shared/ui/icons/logo.png',
      'web/src/shared/ui/fonts/a.woff2',
      'deploy/ansible/inventory.ini',
      'deploy/ansible/ansible.cfg',
      'web/src/features/.gitkeep',
      'scripts/run',
    ]) {
      assert.equal(reasonOf(path), 'extension', path);
    }
  });

  it('skips a file over 512 KB', () => {
    assert.equal(reasonOf('specs/big.md', MAX_FILE_BYTES), 'included');
    assert.equal(reasonOf('specs/big.md', MAX_FILE_BYTES + 1), 'size');
  });

  it('keeps the order and answers each skipped path once', () => {
    const files = [file('api/src/a.ts'), file('package.json'), file('web/src/b.tsx')];
    const { included, skipped } = selectFiles(files);
    assert.deepEqual(
      included.map((f) => f.path),
      ['api/src/a.ts', 'web/src/b.tsx'],
    );
    assert.deepEqual(skipped, [{ path: 'package.json', reason: 'outside' }]);
  });

  it('skips an unmerged path and names it once', () => {
    const files = [
      file('api/src/a.ts', 100, '100644', 1),
      file('api/src/a.ts', 100, '100644', 2),
      file('api/src/a.ts', 100, '100644', 3),
      file('api/src/b.ts'),
    ];
    const { included, skipped } = selectFiles(files);
    assert.deepEqual(
      included.map((f) => f.path),
      ['api/src/b.ts'],
    );
    assert.deepEqual(skipped, [{ path: 'api/src/a.ts', reason: 'unmerged' }]);
  });
});

describe('isIndexablePath', () => {
  it('takes the include rules by path alone', () => {
    for (const path of ['api/src/a.ts', 'specs/0001-a/plan.md', 'CLAUDE.md', '.env.example']) {
      assert.equal(isIndexablePath(path), true, path);
    }
    for (const path of [
      'notes.txt',
      '.env',
      '.rag/index.sqlite',
      'api/src/generated/client.ts',
      'api/openapi.json',
      'web/src/logo.png',
    ]) {
      assert.equal(isIndexablePath(path), false, path);
    }
  });
});

describe('findSecretLine', () => {
  it('finds a private key, cloud and API tokens', () => {
    for (const secret of [
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      '-----BEGIN PRIVATE KEY-----',
      'key: AKIAIOSFODNN7EXAMPLE',
      'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwx',
      'token ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      "slack = 'xoxb-1234567890-abcdef'",
      'S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY12',
      // Built at run time, so gitleaks sees no secret-shaped literal in this file.
      `secret: "${'0123456789abcdef'.repeat(2)}"`,
      '-----END RSA PRIVATE KEY-----',
      '-----BEGIN PGP PRIVATE KEY BLOCK-----',
      `  ${'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7'.padEnd(64, 'x')}`,
      `AGE-SECRET-KEY-1${'QZ9'.repeat(20)}`,
      'client: GOCSPX-abcdefghij_KLMNOPQRS-tuvw',
      'VOYAGE_API_KEY pa-abcdefghijklmnopqrstuvwxyz0123456789',
      'gho_abcdefghijklmnopqrstuvwxyz0123456789 and ghs_abcdefghijklmnopqrst',
      'github_pat_11ABCDEFG0abcdefghijklmnop',
      'Authorization: Bearer abc.def-ghi_jkl~mno+pqr/stu',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature',
      `TOKEN=${BASE64URL}_-aB`,
      `key = "${BASE64URL}_-a=="`,
      `  '${'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7'.padEnd(64, 'x')}',`,
      'OPENAI_PROXY_URL=http://aifitting:Ab3dEfGh5jKlMn0pQrStUvWx@203.0.113.7:3128',
      'BETTER_AUTH_SECRET=abcdefghijklmnopqrstuvwxyz012345',
      `SENTRY_AUTH_TOKEN=sntryu_${'0123456789abcdef'.repeat(4)}`,
    ]) {
      assert.equal(findSecretLine(`line one\n${secret}\nline three`), 1, secret);
    }
  });

  it('flags every window of a key cut by the windows', () => {
    const body = Array.from(
      { length: 50 },
      (_, i) => `    ${`${i}`.padStart(2, '0')}${'Ab'.repeat(31)}`,
    );
    const text = [
      ...Array.from({ length: 38 }, (_, i) => `line${i}: value`),
      '  key: |',
      '    -----BEGIN RSA PRIVATE KEY-----',
      ...body,
      '    -----END RSA PRIVATE KEY-----',
      ...Array.from({ length: 40 }, (_, i) => `after${i}: value`),
    ].join('\n');
    const keyLines = chunkFile({ path: 'deploy/ansible/vars.yml', text, blobHash: HASH }).filter(
      (chunk) => chunk.text.includes('AbAbAb'),
    );
    assert.ok(keyLines.length >= 2);
    for (const chunk of keyLines) assert.notEqual(findSecretLine(chunk.text), null);
  });

  it('passes ordinary code and docs', () => {
    for (const text of [
      "const name = 'fittingRoomItemsOfTheSignedInUserInSlotOrder';",
      'risk-assessment-of-the-new-deployment-procedure-for-backups',
      'image: amazon/aws-cli:2.17.0@sha256:643507c10ada7964ca6157b3d799f030b90577643da9955d319a77399ed80d73',
      '`-----BEGIN` in a sentence about the guard',
      'OPENAI_API_KEY=',
      'ask-for-confirmation-before-every-deploy',
      'const sk = 1;',
      "const MIGRATION = '20261015120000_attribute_values_color_hex';",
      'href="/products/7c9e6679-7425-40de-944b-e07fc1f90001"',
      'hmac_sha256_name_of_a_setting_that_is_long_enough',
      '`http://<user>:<password>@<host>:<port>`',
      'parseOpenAiProxyUrl(`http://proxyuser:${PASSWORD}@proxy.example.ru:3128`)',
      '^http://[A-Za-z0-9]+:[A-Za-z0-9]+@[A-Za-z0-9.-]+:([1-9][0-9]*)$',
      "DATABASE_URL: 'mysql://app:passpasspass@h/db',",
      'S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,',
      'OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}',
      "OPENAI_API_KEY: 'test-openai-key_1',",
    ]) {
      assert.equal(findSecretLine(text), null, text);
    }
  });
});
