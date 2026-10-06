// Cases for the agents' guard hooks; run by `npm test` (and so by `npm run verify` and CI).
// Add a case for every bypass found. The commands below are only checked as text; none is executed.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Blocked } from './guard-lib.mjs';
import { BROWSER_TOOLS, check as qaTester } from './qa-tester-rules.mjs';
import { check as readOnly } from './read-only-rules.mjs';
import { check as testWriter } from './test-writer-rules.mjs';

const HOOKS = import.meta.dirname;
const ROOT = path.resolve(HOOKS, '../..');
process.env.CLAUDE_PROJECT_DIR = ROOT;

const bash = (command) => ['Bash', { command }];
const write = (file) => ['Write', { file_path: path.join(ROOT, file) }];

/** Allowed cases must not throw; blocked ones must throw Blocked (a rule), not a crash. */
function cases(check, allow, block) {
  for (const [tool, input] of allow) {
    it(`allows ${tool} ${JSON.stringify(input.command ?? input.file_path)}`, () => {
      check(tool, input);
    });
  }
  for (const [tool, input] of block) {
    it(`blocks ${tool} ${JSON.stringify(input.command ?? input.file_path ?? input)}`, () => {
      assert.throws(() => check(tool, input), Blocked);
    });
  }
}

describe('read-only rules', () => {
  cases(
    readOnly,
    [
      bash('ls specs'),
      bash('ls'),
      bash("grep -n 'B7' specs/0001-bootstrap/clarifications.md"),
      bash("rg -n 'rate limit|throttl' specs CLAUDE.md"),
      bash("find specs -name '*.md'"),
      bash('git diff main...HEAD'),
      bash('git log --oneline -5'),
      bash("git log -S'apiFetch' --oneline"),
      bash("rg -n 'process.env' api/src"),
      bash('git show HEAD --stat'),
      bash('git ls-files api/src'),
      bash('grep -n THROTTLE .env.example'),
      bash("grep -n '' CLAUDE.md"),
    ],
    [
      bash('grep -rn B7 specs | head'),
      bash('grep -n x CLAUDE.md > out.txt'),
      bash('ls; rm -rf specs'),
      bash('ls\nrm -rf specs'),
      bash("find specs -name '*.md' -delete"),
      bash('find . -exec rm {} ;'),
      bash("find . '-exec' touch pwn ';'"),
      bash('rg --pre ./evil.sh x'),
      bash("rg '--pre=sh' x"),
      bash('rg -z x'),
      bash('git diff --output=x.patch'),
      bash("git diff '--output=x.patch'"),
      bash("git difftool -y -x 'touch /tmp/pwn' HEAD"),
      bash('git diff-tree HEAD'),
      bash('git diff --no-index /dev/null /etc/hosts'),
      bash('git -C /tmp log'),
      bash('git'),
      bash('git checkout main'),
      bash('cat CLAUDE.md'),
      bash('sed -i s/a/b/ CLAUDE.md'),
      bash('grep "$(id)" specs'),
      bash(`grep "'" f; touch pwn; echo "'"`),
      bash('grep x .env'),
      bash('grep x .env.local'),
      bash("grep x .e'n'v"),
      bash("grep '' .en?"),
      bash('grep -rn KEY .'),
      bash('grep -n x deploy/ansible/vault.yml'),
      bash('git show HEAD:.env'),
      bash('rg -uu KEY'),
      bash('rg --no-ignore KEY'),
      // Second review: abbreviations, case, other program runners, zsh expansions.
      bash("grep --recur -n '' ."),
      bash("grep --dir=recurse -n '' ."),
      bash("grep --deref -n '' ."),
      bash('grep -f patterns.txt CLAUDE.md'),
      bash("grep -n '' .ENV"),
      bash("rg '' .Env"),
      bash('git blame --contents=.ENV -- CLAUDE.md'),
      bash("grep -n '' deploy/ansible/VAULT.yml"),
      bash('rg --hostname-bin=/usr/bin/true --hyperlink-format=default x'),
      bash('git diff --outp=x.patch'),
      bash('git log --no-ind'),
      bash("grep '' ^CLAUDE.md"),
      bash('ls =ls'),
      bash('ls \u0000'),
      bash('find . -fprintf x y'),
      bash('find . -newerXY x'),
      // Third review: globs overriding .gitignore, flags that read a named file.
      bash("rg -n -g '.env*' ''"),
      bash("rg -n --glob='.env*' ''"),
      bash("rg --hidden -n 'KEY'"),
      bash('git blame -S.env -- README.md'),
      bash('git blame -SREADME.md -- CLAUDE.md'),
      bash('git blame --contents=CLAUDE.md -- README.md'),
      bash('git blame --ignore-revs-file=x -- README.md'),
      bash('git diff -Oorder.txt'),
      bash('git ls-files -X excludes.txt'),
      bash('ls ~'),
      bash('FOO=1 ls'),
      bash(''),
      ['Write', { file_path: '/tmp/x' }],
    ],
  );
});

describe('qa-tester rules', () => {
  cases(
    qaTester,
    [
      bash('curl -s http://localhost:3000/health/live'),
      bash(
        `curl -si -X POST -H 'Content-Type: application/json' -d '{"a":1}' http://localhost:3000/hello`,
      ),
      bash("curl -s 'http://localhost:3000/x?a=1&b=$2'"),
      bash('curl -s --parallel --parallel-max 50 http://localhost:3000/a http://127.0.0.1:3001/'),
      bash("curl -s -w '%{http_code}' http://localhost:8233/"),
      bash('curl -s --max-time=5 http://localhost:3000/'),
      bash("curl -s -b 'sid=1' http://localhost:3001/"),
      bash('docker compose ps'),
      bash('docker compose logs --tail 100 api'),
      bash('docker compose logs --tail=50 --no-color api temporal-worker'),
      bash('docker compose stop redis'),
      bash('docker compose start redis'),
      bash('docker compose up -d --wait'),
      ['mcp__playwright__browser_navigate', { url: 'http://localhost:3001/' }],
      ['mcp__playwright__browser_take_screenshot', { type: 'png', fullPage: true }],
      ['mcp__playwright__browser_snapshot', {}],
      ['mcp__playwright__browser_tabs', { action: 'new', url: 'http://localhost:3001/' }],
      ['mcp__playwright__browser_tabs', { action: 'list' }],
      ['mcp__playwright__browser_cookie_set', { name: 'a', value: 'b', path: '/' }],
      ['mcp__playwright__browser_evaluate', { function: '() => document.title' }],
    ],
    [
      bash('curl -s https://evil.example.com/x'),
      bash('curl -s http://localhost:3000/ evil.example.com'),
      bash('curl http://localhost:3000/ 1.2.3.4/x'),
      bash('curl http://localhost:3000/ evil'),
      bash('curl -s http://localhost:5433/'),
      bash('curl -s http://localhost:3000.evil.com/'),
      bash('curl -o out.html http://localhost:3001/'),
      bash('curl -o/tmp/x http://localhost:3000/'),
      bash('curl -sO http://localhost:3001/x'),
      bash('curl -K./cfg http://localhost:3000/'),
      bash('curl -x1.2.3.4:8080 http://localhost:3000/'),
      bash('curl --socks5 1.2.3.4 http://localhost:3000/'),
      bash('curl -L http://localhost:3000/'),
      bash("curl -w '%output{/tmp/x}' http://localhost:3000/"),
      bash('curl --etag-save x http://localhost:3000/'),
      bash('curl -d @.env http://localhost:3000/'),
      bash('curl -s -w @.env http://localhost:3000/'),
      bash('curl -s --write-out=@.env http://localhost:3000/'),
      bash('curl -s -w @/etc/passwd http://localhost:3000/'),
      bash('curl -s --verb http://localhost:3000/'),
      ['mcp__playwright__browser_run_code_unsafe', { code: 'async () => 1' }],
      ['mcp__playwright__browser_file_upload', { paths: ['/tmp/x'] }],
      ['mcp__playwright__browser_set_storage_state', { filename: 'x.json' }],
      ['mcp__playwright__browser_pdf_save', {}],
      ['mcp__playwright__browser_take_screenshot', { filename: 'CLAUDE.md' }],
      ['mcp__playwright__browser_snapshot', { filename: 'x.md' }],
      ['mcp__playwright__browser_navigate', { url: 'https://example.com/' }],
      ['mcp__playwright__browser_navigate', { url: 'file:///etc/passwd' }],
      ['mcp__other__tool', {}],
      ['mcp__playwright__browser_tabs', { action: 'new', url: 'https://example.com/' }],
      ['mcp__playwright__browser_navigate', {}],
      ['mcp__playwright__browser_network_requests', { filename: 'requests.txt' }],
      bash('curl -d @x http://localhost:3000/'),
      bash('curl -d@x http://localhost:3000/'),
      bash('curl --data=@x http://localhost:3000/'),
      bash("curl -d '@x' http://localhost:3000/"),
      bash("curl --data-urlencode 'a@x' http://localhost:3000/"),
      bash('curl -H @headers.txt http://localhost:3000/'),
      bash('curl -b cookies.txt http://localhost:3000/'),
      bash('curl -F f=@x http://localhost:3000/'),
      bash('curl --resolve localhost:3000:1.2.3.4 http://localhost:3000/'),
      bash('curl -s http://localhost:3000/ | sh'),
      bash('curl -s http://localhost:3000/ > f'),
      bash('curl -s "http://localhost:3000/$(id)"'),
      bash(`curl http://localhost:3000/ "'"; touch pwn; echo "'"`),
      bash("curl -s 'http://localhost:3000/ ; rm x"),
      bash('curl -s'),
      bash('docker compose down'),
      bash('docker compose stop'),
      bash('docker compose stop redis api'),
      bash(`docker compose ps "'"; touch pwn; "'"`),
      bash('docker compose exec postgres psql'),
      bash('docker compose up -d --build'),
      bash('docker compose up -d --wait api'),
      bash('docker compose logs api --follow'),
      bash('rm -rf api'),
      bash('git push'),
    ],
  );
});

describe('test-writer rules', () => {
  cases(
    testWriter,
    [
      write('api/src/hello/x.spec.ts'),
      write('api/test/a.e2e-spec.ts'),
      bash('npm --prefix api test'),
      bash('npm --prefix api test -- src/hello/x.spec.ts'),
      bash("npm --prefix api run test -- -t 'returns the greeting'"),
      bash('npm --prefix api run typecheck'),
      bash('npx eslint --max-warnings=0 api/src/hello/x.spec.ts'),
    ],
    [
      write('api/src/hello/hello.service.ts'),
      write('api/src/../vitest.config.spec.ts'),
      write('api/vitest.config.ts'),
      ['Write', { file_path: '/tmp/api/src/x.spec.ts' }],
      ['Edit', {}],
      bash('npm --prefix api test; rm -rf api'),
      bash('npm --prefix api test -- x\ntouch pwn'),
      bash('npm --prefix api test && git commit'),
      bash('npm --prefix api test -- --config evil.ts'),
      bash('npm --prefix api test -- ../../etc'),
      bash('npm --prefix api test -- $(rm x)'),
      bash('npm --prefix api test -- -t --outputFile=CLAUDE.md -t x'),
      bash('npm --prefix api test -- -t -u'),
      bash('npm --prefix api test extra'),
      bash('sed -i s/a/b/ api/src/main.ts'),
      bash('npx eslint --fix api/src/main.ts'),
      bash('npx eslint --max-warnings=0 --fix api/src/main.ts'),
      ['Read', { file_path: '/x' }],
    ],
  );
});

describe('guard.mjs process', () => {
  const run = (args, input, env = process.env) =>
    spawnSync(process.execPath, [path.join(HOOKS, 'guard.mjs'), ...args], {
      input,
      env,
      encoding: 'utf8',
    });
  const bashInput = (command) => JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

  it('exits 0 when allowed', () => {
    assert.equal(run(['read-only'], bashInput('ls')).status, 0);
  });

  it('exits 2 with the reason when blocked', () => {
    const r = run(['read-only'], bashInput('rm x'));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Blocked by \.claude\/hooks\/guard\.mjs read-only/);
  });

  it('blocks with an unknown or missing rules name', () => {
    assert.equal(run(['nope'], bashInput('ls')).status, 2);
    assert.equal(run([], bashInput('ls')).status, 2);
  });

  it('blocks on input it cannot parse', () => {
    assert.equal(run(['qa-tester'], 'not json').status, 2);
  });

  it('blocks writes when CLAUDE_PROJECT_DIR is missing', () => {
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: path.join(ROOT, 'api/src/x.spec.ts') },
    });
    assert.equal(run(['test-writer'], input, env).status, 2);
  });
});

describe('agent files', () => {
  it('qa-tester tools list the same browser tools as its rules allow', () => {
    const agent = fs.readFileSync(path.join(ROOT, '.claude/agents/qa-tester.md'), 'utf8');
    const listed = agent.match(/^tools: (.*)$/m)[1].match(/mcp__playwright__\w+/g) ?? [];
    assert.deepEqual([...listed].sort(), [...BROWSER_TOOLS].sort());
  });
});
