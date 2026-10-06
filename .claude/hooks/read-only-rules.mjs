// Rules for Bash in read-only agents (spec-finder, code-reviewer).
//
// Bash is there only to find and search files and to read git history; reading files is the Read
// tool's job. Allowed: ls, grep (one file at a time: rg searches directories and skips git-ignored
// files), rg, find (listing only) and git diff|log|show|status|ls-files|blame. Secret files are
// never named. Flags of ls, grep, rg and find are allowlisted.

import { Blocked, allowFlags, isSecret, words } from './guard-lib.mjs';

const LS = { short: 'lahtrRS1dFG' };
const GREP = { short: 'niIlLcvwxoFEGhHsq', withValue: ['-e', '-A', '-B', '-C', '-m'] };
const RG = {
  short: 'nilcwFSsvxoqHN',
  long: [
    '--files',
    '--hidden',
    '--line-number',
    '--ignore-case',
    '--smart-case',
    '--fixed-strings',
    '--count',
    '--files-with-matches',
    '--word-regexp',
    '--no-heading',
    '--with-filename',
  ],
  withValue: [
    '-e',
    '-g',
    '-t',
    '-T',
    '-A',
    '-B',
    '-C',
    '-m',
    '--glob',
    '--type',
    '--type-not',
    '--max-count',
    '--sort',
  ],
};
const FIND = {
  long: ['-print', '-empty', '-prune', '-o', '-or', '-a', '-and', '-not'],
  withValue: [
    '-name',
    '-iname',
    '-path',
    '-ipath',
    '-type',
    '-maxdepth',
    '-mindepth',
    '-newer',
    '-size',
    '-mtime',
  ],
};

const GIT_SUBCOMMANDS = ['diff', 'log', 'show', 'status', 'ls-files', 'blame'];
// git has too many flags to allowlist; these write files, run programs or leave the repository.
// git accepts any unambiguous abbreviation of a long option, so a prefix of one is refused too.
const GIT_BANNED = [
  '--output',
  '--ext-diff',
  '--no-index',
  '--textconv',
  '--exec-path',
  '--open-files-in-pager',
];

function checkGit(args) {
  if (!GIT_SUBCOMMANDS.includes(args[0]))
    throw new Blocked(`git: only ${GIT_SUBCOMMANDS.join(', ')}`);
  for (const a of args.slice(1)) {
    if (a === '--') break;
    const name = a.split('=')[0];
    if (name.startsWith('--') && GIT_BANNED.some((b) => b.startsWith(name))) {
      throw new Blocked(`git flag ${a} writes files, runs programs or leaves the repository`);
    }
  }
}

export function check(tool, input) {
  if (tool !== 'Bash') throw new Blocked(`unexpected tool ${JSON.stringify(tool)}`);
  const argv = words(input.command);
  if (argv.length === 0) throw new Blocked('empty command');
  if (argv.some(isSecret)) throw new Blocked('secret files are not read');

  const [prog, ...args] = argv;
  if (prog === 'ls') allowFlags(prog, args, LS);
  else if (prog === 'grep') allowFlags(prog, args, GREP);
  else if (prog === 'rg') allowFlags(prog, args, RG);
  else if (prog === 'find') allowFlags(prog, args, FIND);
  else if (prog === 'git') checkGit(args);
  else {
    throw new Blocked(
      'allowed: ls, grep, rg, find, git diff|log|show|status|ls-files|blame. ' +
        'Read files with the Read tool.',
    );
  }
}
