// Rules for Bash in the main session (hook in .claude/settings.json; it also runs for subagents).
//
// The main session needs full shell, so this is a blocklist of what destroys data, skips the
// project's checks or prints secrets, even when a tool output, a skill or a web page says it is
// fine. It guards against mistakes, not against a determined bypass: the agents' allowlists
// (*-rules.mjs) are the strict ones. Commands that only need a confirmation are "ask" rules in
// .claude/settings.json.

import path from 'node:path';

import { Blocked, commands, isSecret } from './guard-lib.mjs';

const ASK_OWNER = 'If this is really needed, ask the owner to run it by hand.';
const block = (why) => {
  throw new Blocked(`${why}. ${ASK_OWNER}`);
};

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const WRAPPERS = new Set([
  'env',
  'command',
  'exec',
  'nice',
  'nohup',
  'time',
  'sudo',
  'builtin',
  'xargs',
]);

/** Drops leading VAR=value words and wrappers (env, xargs, ...), checking the assignments. */
function unwrap(argv) {
  let rest = argv;
  for (;;) {
    while (rest.length > 0 && ASSIGNMENT.test(rest[0])) {
      if (/^GIT_CONFIG/i.test(rest[0])) block('git configuration through the environment');
      rest = rest.slice(1);
    }
    const prog = path.basename(rest[0] ?? '');
    if (!WRAPPERS.has(prog)) return rest;
    // `env` alone (or with only assignments) prints the environment.
    if (prog === 'env' && rest.slice(1).every((a) => a.startsWith('-') || ASSIGNMENT.test(a))) {
      block('printing the environment');
    }
    rest = rest.slice(1);
    while (rest.length > 0 && rest[0].startsWith('-')) rest = rest.slice(1);
  }
}

// A glob pattern (unquoted * ? [...]) as a test on a file name.
function globMatches(pattern, name) {
  const re = pattern
    .split('')
    .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : /[\\^$.|+(){}]/.test(c) ? `\\${c}` : c))
    .join('');
  try {
    return new RegExp(`^${re}$`, 'i').test(name);
  } catch {
    // An unclosed [ (the `[` command, `[[`) is a literal character to the shell, not a glob.
    return new RegExp(`^${re.replaceAll('[', '\\[')}$`, 'i').test(name);
  }
}
const SECRET_NAMES = ['.env', '.env.local', '.env.production', 'vault.yml'];

function checkSecrets({ argv, globbed }) {
  argv.forEach((w, i) => {
    // A path word naming a secret file (a word with spaces is a message, not a path).
    if (!/\s/.test(w) && isSecret(w)) block('secret files are not read or written by Claude');
    if (globbed.has(i)) {
      const base = w.split('/').pop();
      if (SECRET_NAMES.some((n) => globMatches(base, n)))
        block(`the glob ${w} matches a secret file`);
    }
  });
}

function checkDocker(argv) {
  const words = argv.slice(1);
  const at = (w) => words.indexOf(w);
  // Short flags may be bundled (-vf).
  const hasShort = (list, letter) => list.some((a) => /^-[a-z]+$/i.test(a) && a.includes(letter));
  const isCompose = argv[0] === 'docker-compose' || at('compose') !== -1;

  if (isCompose && at('down') !== -1) {
    const flags = words.slice(at('down') + 1);
    if (flags.includes('--volumes') || hasShort(flags, 'v'))
      block('compose down with volumes deletes data');
  }
  if (at('volume') !== -1 && ['rm', 'remove', 'prune'].some((s) => words.includes(s))) {
    block('removing docker volumes deletes data');
  }
  if (at('system') !== -1 && at('prune') !== -1 && words.some((w) => w.startsWith('--volumes'))) {
    block('pruning docker volumes deletes data');
  }
  // These print interpolated secrets from .env or the containers' environment.
  if (isCompose && (at('config') !== -1 || at('convert') !== -1)) {
    const listing = ['--no-interpolate', '--services', '--volumes', '--profiles', '--images'];
    if (!words.some((w) => listing.includes(w))) {
      block('compose config prints secrets from .env; add --no-interpolate');
    }
  }
  if (words.includes('printenv') || words.at(-1) === 'env')
    block('printing a container environment');
  if (at('inspect') !== -1 && !words.some((w) => w === '-f' || w.startsWith('--format'))) {
    block('docker inspect prints container environments; select fields with --format');
  }
}

function checkPrisma(argv) {
  const i = argv.findIndex((w) => path.basename(w) === 'prisma');
  if (i === -1) return;
  const [a, b] = argv.slice(i + 1).filter((w) => !w.startsWith('-'));
  if (a === 'migrate' && b === 'reset') block('prisma migrate reset drops the database');
  if (a === 'db' && b === 'push') block('prisma db push changes the schema without a migration');
}

const HOOKS_PATH = 'core.hookspath';

function checkGit(argv) {
  let i = 1;
  // Global options before the subcommand.
  for (; i < argv.length && argv[i].startsWith('-'); i++) {
    const a = argv[i];
    if (a === '-c' || a === '--config-env' || a.startsWith('-c') || a.startsWith('--config-env=')) {
      const value = a === '-c' || a === '--config-env' ? (argv[++i] ?? '') : a;
      if (value.toLowerCase().includes(HOOKS_PATH)) block('overriding the git hooks path');
    } else if (['-C', '--git-dir', '--work-tree', '--namespace', '--exec-path'].includes(a)) {
      i++;
    }
  }
  const sub = argv[i];
  const args = argv.slice(i + 1);
  const flags = args.filter((a) => a.startsWith('-'));
  // git accepts any unambiguous prefix of a long option.
  const longPrefixOf = (full, min) =>
    flags.some((f) => f.length >= min && full.startsWith(f.split('=')[0]));
  const shortHas = (letter) => flags.some((f) => /^-[a-z]+$/i.test(f) && f.includes(letter));

  if (['commit', 'push', 'merge', 'rebase', 'am', 'cherry-pick', 'revert'].includes(sub)) {
    if (longPrefixOf('--no-verify', 6)) block('skipping git hooks');
  }
  if (sub === 'commit' && shortHas('n')) block('skipping git hooks (-n)');
  if (sub === 'push') {
    if (
      flags.some((f) => f.startsWith('--forc')) ||
      shortHas('f') ||
      args.some((a) => a.startsWith('+'))
    ) {
      block('force push rewrites history');
    }
  }
  if (sub === 'config') {
    const lower = args.map((a) => a.toLowerCase());
    const k = lower.indexOf(HOOKS_PATH);
    if (
      lower.some((a) =>
        ['--remove-section', 'remove-section', 'rename-section', '--rename-section'].includes(a),
      )
    ) {
      block('removing git config sections can drop the hooks path');
    }
    if (k !== -1) {
      const unsets = ['--unset', '--unset-all', 'unset', '--replace-all'];
      if (lower.some((a) => unsets.includes(a))) block('unsetting the git hooks path');
      const values = args.slice(k + 1).filter((a) => !a.startsWith('-'));
      if (values.length > 0 && !(values.length === 1 && values[0] === '.githooks')) {
        block('changing the git hooks path');
      }
    }
  }
}

export function check(tool, input) {
  if (tool !== 'Bash') return;
  const line = input.command;
  if (typeof line !== 'string') throw new Blocked('no command');
  for (const segment of commands(line)) {
    // Before unwrap: `globbed` holds indexes into the segment's own words.
    checkSecrets(segment);
    const argv = unwrap(segment.argv);
    if (argv.length === 0) continue;
    const prog = path.basename(argv[0]);
    if (prog === 'export') unwrap(argv.slice(1));
    if (prog === 'printenv') block('printing the environment');
    checkPrisma(argv);
    if (prog === 'docker' || prog === 'docker-compose') checkDocker(argv);
    if (prog === 'git') checkGit(argv);
  }
}
