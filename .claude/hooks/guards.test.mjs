// Cases for the agents' guard hooks; run by `npm test` (and so by `npm run verify` and CI).
// Add a case for every bypass found. The commands below are only checked as text; none is executed.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Blocked } from './guard-lib.mjs';
import { check as main } from './main-rules.mjs';
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
      bash("curl -s -G --data-urlencode 'name=Ёжик в тумане' http://localhost:3000/hello"),
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

describe('main rules', () => {
  cases(
    main,
    [
      // Everyday commands of a session must pass.
      bash(
        'npm run verify > /tmp/verify.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/verify.log',
      ),
      bash('git status -s && git log --oneline -3'),
      bash(
        'git commit -q -m "chore(tooling): x" -m "Blocks docker volume rm, git push --force and .env reads."',
      ),
      bash(
        "git commit -q -F - <<'EOF'\nfix(deploy): y\n\nNo prisma db push, no docker volume rm here.\nEOF",
      ),
      bash('git push -u origin chore/claude-agents'),
      bash('git config core.hooksPath'),
      bash('git config --get core.hooksPath'),
      bash('git config core.hooksPath .githooks'),
      bash("git log -S'apiFetch' --oneline"),
      bash('docker compose up -d --wait'),
      bash('docker compose ps --format json'),
      bash('docker compose down'),
      bash('docker compose config --no-interpolate'),
      bash('docker compose config --services'),
      bash("docker inspect --format '{{.State.Health.Status}}' api"),
      bash('docker compose run --rm api npx prisma generate'),
      bash('npx prisma migrate dev --name add_looks'),
      bash('cp .env.example /tmp/x && grep -n THROTTLE .env.example'),
      bash("rg -n 'process.env' api/src"),
      bash('env NODE_ENV=test npm --prefix api test'),
      bash('ls -la'),
      bash("echo 'printenv is blocked'"),
      // Found live: `[` is the test command, not a glob.
      bash('[ $rc -ne 0 ] && tail -20 /tmp/verify.log'),
      bash('[[ -f package.json ]] && echo yes'),
      // False positives from the review of the parsing version: globs follow shell rules.
      bash('du -sh *'),
      bash('ls api/*'),
      bash('ls -la specs/*'),
      bash('for f in specs/*; do wc -l "$f"; done'),
      bash('git add api/src/*'),
      bash('rm -rf web/.next/*'),
      bash('cat .github/workflows/*.yml'),
      bash('npx prettier --check deploy/*.yml'),
      bash('docker network inspect ai-fitting_default'),
      bash('docker volume inspect ai-fitting_pgdata'),
      bash('docker buildx imagetools inspect ghcr.io/x/y:1'),
      bash('docker compose config -q'),
      bash('docker volume ls'),
      // Messages and patterns are data, even when they name a blocked command.
      bash('git commit -m "docs: never git -c core.hooksPath=/dev/null or read /proc/1/environ"'),
      bash("rg -n 'core.hooksPath|/proc/1/environ|printenv' .claude"),
      bash(
        'git commit -q -F - <<EOF\nfix: y\n\nmentions docker volume rm and git push --force\nEOF',
      ),
      bash('git commit --amend --no-edit'),
      bash("rg -n --hidden 'KEY' api"),
      bash('grep -n x CLAUDE.md'),
      bash("grep -rn --exclude='.env*' KEY ."),
      bash('find specs -name "*.md"'),
      bash('git push origin feature/fix-force-thing'),
      bash('env NODE_ENV=test node -e "console.log(1)"'),
      // Single review pass of the word-scan version: false positives.
      bash("docker inspect --format '{{json .Config.Healthcheck}}' api"),
      bash("docker inspect -f '{{.Config.Image}}' api"),
      bash("find . -name '*.ts' | xargs -r grep -l foo"),
      bash('git log --grep commit -n 5'),
      bash('echo "exit=$rc"'),
      // The fixes above must not block these.
      bash("find api/src -name '*.ts' | xargs grep -n apiFetch"),
      bash("find . -name '*.md' -exec wc -l {} +"),
      bash("find . -type f | xargs grep -n --exclude='.env*' KEY"),
      bash('ssh ai-fitting "docker compose ps"'),
      bash('ssh ai-fitting'),
      bash('cp api/src/{a,b}.ts /tmp'),
      bash('git grep -n apiFetch'),
      // Found live: rg -U is --multiline, not -u.
      bash("rg -n -U 'Production and\\s+deploys' .claude/agents/"),
      bash('git diff --output-indicator-new=+ HEAD'),
      bash('git diff HEAD > /tmp/x.patch'),
      bash('git grep --no-index --exclude-standard KEY'),
      bash("npx -c 'prisma generate'"),
      bash("git commit -q -F - <<'EOF'\nfix: y\n\n1) a paren and an apostrophe: don't\nEOF"),
    ],
    [
      // The old guard-bash.sh rules.
      bash('docker compose down -v'),
      bash('docker compose down --volumes'),
      bash('docker compose down -vt 5'),
      bash('docker volume rm ai-fitting_pgdata'),
      bash('docker volume prune -f'),
      bash('docker system prune -a --volumes'),
      bash('npx prisma migrate reset --force'),
      bash('docker compose run --rm api npx prisma db push'),
      bash('git commit --no-verify -m x'),
      bash('git commit -nm x'),
      bash('git push --no-verify'),
      bash('git push --force'),
      bash('git push --force-with-lease'),
      bash('git push -fu origin x'),
      bash('git push origin +main'),
      bash('git config --unset core.hooksPath'),
      bash('git config core.hooksPath /dev/null'),
      // Security audit bypasses.
      bash('git config unset core.hooksPath'),
      bash('git -c core.hooksPath=/dev/null commit -m x'),
      bash('git -ccore.hooksPath=/dev/null commit -m x'),
      bash(
        'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=x git commit -m x',
      ),
      bash('export GIT_CONFIG_PARAMETERS=x'),
      bash('git commit --no-verif -m x'),
      bash('git commit --no-ver -m x'),
      bash('git push --forc'),
      bash('git config --remove-section core'),
      bash('docker volume remove ai-fitting_pgdata'),
      bash('docker --context default volume rm x'),
      // Chained, nested or wrapped.
      bash('ls && docker volume rm x'),
      bash('echo $(git push --force)'),
      bash('echo `docker volume rm x`'),
      bash("sh -c 'git push --force'"),
      bash('bash -lc "docker compose down -v"'),
      bash("eval 'git commit --no-verify'"),
      bash("bash <<'EOF'\ngit push --force\nEOF"),
      bash('xargs -n1 docker volume rm < list'),
      bash('env git commit --no-verify -m x'),
      // Secrets.
      bash('cat .env'),
      bash('cat .ENV'),
      bash('source .env && echo $DATABASE_URL'),
      bash('grep KEY < .env'),
      bash('cat .en?'),
      bash('cat .e*'),
      bash('cat deploy/ansible/vault.yml'),
      bash('docker compose config'),
      bash('docker compose exec api printenv'),
      bash('docker compose exec api env'),
      bash('docker inspect api'),
      bash('printenv'),
      bash('env'),
      bash('env -i'),
      // Review of the parsing version: reserved words, wrappers with values, continuations.
      bash('for v in $(docker volume ls -q); do docker volume rm "$v"; done'),
      bash('if ! git push --force-with-lease; then echo failed; fi'),
      bash('{ git commit --no-verify -m x; } 2>&1 | tail -3'),
      bash('if [ -n "$x" ]; then docker compose down -v; fi'),
      bash('docker volume ls -q | xargs -I {} docker volume rm {}'),
      bash('nice -n 10 git push --force'),
      bash('env -u FOO git commit --no-verify -m x'),
      bash('sudo -u eva git push -f'),
      bash('timeout 120 git push --force'),
      bash('git -C /Users/eva/repo \\\n  push --force-with-lease origin x'),
      bash('docker compose run --rm api npx prisma \\\n  db push'),
      bash('git push \\\n--force'),
      // Code run inside containers or other shells.
      bash("docker compose exec api sh -c 'printenv | grep DATABASE'"),
      bash("docker compose exec -T api sh <<'EOF'\nprintenv\nEOF"),
      bash('docker compose exec api node -p process.env'),
      bash('docker compose exec api cat /proc/1/environ'),
      bash('docker compose exec api /usr/bin/env'),
      bash("env bash -c 'git push --force'"),
      bash("nohup sh -c 'docker volume rm x'"),
      bash("docker inspect --format '{{json .Config.Env}}' api"),
      bash("docker inspect -f '{{json .}}' api"),
      bash("docker container inspect -f '{{.Config.Env}}' api"),
      // Searches that reach secrets.
      bash("grep -rn 'SENTRY_AUTH_TOKEN' ."),
      bash('grep -R KEY .'),
      bash('rg -n --no-ignore POSTGRES_PASSWORD'),
      bash('rg -uu KEY'),
      bash("find . -name '.env*' -exec cat {} +"),
      bash('cat .[e]nv'),
      bash('cat deploy/ansible/vault*'),
      // Smaller ones.
      bash('docker compose down --volumes=true'),
      bash('npx prisma@7 db push'),
      bash('git pull --no-verify'),
      bash('cat > /tmp/n <<EOF\n$(docker volume rm ai-fitting_pgdata)\nEOF'),
      bash("cat <<'EOF' | sh\ngit push --force\nEOF"),
      bash("bash <<< 'git push --force'"),
      bash('declare -x GIT_CONFIG_COUNT=1'),
      bash('gh auth token'),
      bash('gh auth status -t'),
      // Single review pass of the word-scan version: high findings.
      bash(
        'docker compose exec api node -e "console.log(process.env.DATABASE_URL, process.env.REDIS_URL)"',
      ),
      bash('node -e "const { DATABASE_URL } = process.env; console.log(DATABASE_URL)"'),
      bash('node -pe "process.env.DATABASE_URL"'),
      bash('node --eval="console.log(process.env)"'),
      bash("docker compose exec api sh -c 'echo $DATABASE_URL'"),
      bash("docker compose exec postgres sh -c 'echo $POSTGRES_PASSWORD'"),
      bash('echo "${SENTRY_AUTH_TOKEN}"'),
      bash('docker inspect --format json api'),
      bash('docker inspect --format=json api'),
      // Former accepted risks, fixed at the owner's request.
      bash('find . -type f -not -path "./node_modules/*" | xargs grep -n DATABASE_URL'),
      bash('find . -type f -exec grep -H DATABASE_URL {} +'),
      bash("find . -name '*env*' -exec cat {} +"),
      bash("find . -name '*env*'"),
      bash("ssh ai-fitting 'docker compose -f /srv/app/compose.yml down -v'"),
      bash('ssh ai-fitting "docker volume prune -f"'),
      bash("ssh -p 22 ai-fitting 'cat /srv/app/.env'"),
      bash('grep -r --exclude=.env foo .'),
      bash('diff {.env,.env.example}'),
      bash('cat .env{,.example}'),
      bash('git grep --no-index DATABASE_URL'),
      bash('rg -nu KEY'),
      bash('rg -Uuu KEY'),
      bash("npx -c 'prisma migrate reset --force'"),
      bash("npm exec -c 'prisma db push'"),
      bash("npm exec --call='git push --force'"),
      bash('git diff --output=.claude/hooks/main-rules.mjs HEAD~1'),
      bash('git log -p --outp=CLAUDE.md'),
      bash("echo $(cat <<'EOF'\n1) don't\nEOF\n) && git push --force"),
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
