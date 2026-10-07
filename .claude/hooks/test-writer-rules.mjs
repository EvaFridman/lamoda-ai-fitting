// Rules for Edit, Write and Bash in the test-writer agent.
//
// The agent may write only test files of api and web, and run only their tests, typechecks and
// ESLint on their files. Limit: a test it writes runs with the owner's rights when Vitest
// executes it, so a test can still touch anything; the guard cannot see that. After the agent runs,
// the main context checks `git status` that only test files changed (CLAUDE.md, "How work is done").

import fs from 'node:fs';
import path from 'node:path';

import { Blocked, projectDir, words } from './guard-lib.mjs';

const TEST_FILE =
  /^api\/src\/[\w./-]+\.spec\.ts$|^api\/test\/[\w./-]+\.e2e-spec\.ts$|^web\/src\/[\w./-]+\.test\.tsx?$/;
// Paths Vitest gets, relative to the package it runs in.
const VITEST_PATH = { api: /^(src|test)\/[\w./-]+$/, web: /^src\/[\w./-]+$/ };
const LINT_PATH = /^api\/(src|test)\/[\w./-]+$|^web\/src\/[\w./-]+$/;
const hasDotDot = (p) => p.split('/').includes('..');

/** Resolves symlinks of the longest existing parent, so a link cannot lead outside the project. */
function realPath(p) {
  const abs = path.resolve(p);
  let dir = abs;
  while (!fs.existsSync(dir)) dir = path.dirname(dir);
  return path.join(fs.realpathSync(dir), path.relative(dir, abs));
}

function checkPath(file) {
  if (!file) throw new Blocked('no file_path');
  const root = fs.realpathSync(projectDir());
  const real = realPath(file);
  if (!real.startsWith(root + path.sep)) throw new Blocked(`outside the project: ${file}`);
  const rel = path.relative(root, real).split(path.sep).join('/');
  if (hasDotDot(rel) || !TEST_FILE.test(rel)) {
    throw new Blocked(
      'only api/src/**/*.spec.ts, api/test/**/*.e2e-spec.ts and web/src/**/*.test.ts(x) may be ' +
        `written, not ${rel}. ` +
        'Report bugs in the code instead of changing it.',
    );
  }
}

function checkVitestArgs(pkg, args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    // A value starting with - would be parsed by Vitest as a flag of its own (--outputFile=...).
    if (
      ['-t', '--testNamePattern'].includes(a) &&
      i + 1 < args.length &&
      !args[i + 1].startsWith('-')
    )
      i++;
    else if (['--reporter=dot', '--reporter=verbose', '--reporter=default'].includes(a)) continue;
    else if (VITEST_PATH[pkg].test(a) && !hasDotDot(a)) continue;
    else {
      throw new Blocked(
        `vitest argument ${JSON.stringify(a)} is not allowed: test paths, -t <name>, --reporter=dot|verbose|default`,
      );
    }
  }
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function checkBash(cmd) {
  const argv = words(cmd);
  if (same(argv.slice(0, 3), ['npx', 'eslint', '--max-warnings=0']) && argv.length > 3) {
    for (const p of argv.slice(3)) {
      if (!LINT_PATH.test(p) || hasDotDot(p)) {
        throw new Blocked(`eslint only on api or web files, no other flags: ${JSON.stringify(p)}`);
      }
    }
    return;
  }
  const pkg = argv[2];
  // The web typecheck runs `next typegen`, which writes only git-ignored files (spec 0003, D12a).
  if (['api', 'web'].includes(pkg) && same(argv, ['npm', '--prefix', pkg, 'run', 'typecheck'])) {
    return;
  }
  const npm = same(argv.slice(0, 2), ['npm', '--prefix']) && Object.hasOwn(VITEST_PATH, pkg);
  let rest;
  if (npm && argv[3] === 'test') rest = argv.slice(4);
  else if (npm && same(argv.slice(3, 5), ['run', 'test'])) rest = argv.slice(5);
  else {
    throw new Blocked(
      "allowed: 'npm --prefix api|web test [-- <test paths> | -t <name>]', " +
        "'npm --prefix api|web run typecheck', " +
        "'npx eslint --max-warnings=0 api/<files> web/src/<files>'",
    );
  }
  if (rest[0] === '--') checkVitestArgs(pkg, rest.slice(1));
  else if (rest.length > 0) throw new Blocked('vitest arguments go after --');
}

export function check(tool, input) {
  if (tool === 'Edit' || tool === 'Write') return checkPath(input.file_path);
  if (tool === 'Bash') return checkBash(input.command);
  throw new Blocked(`unexpected tool ${JSON.stringify(tool)}`);
}
