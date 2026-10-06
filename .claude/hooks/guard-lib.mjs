// Shared code of the agents' PreToolUse guards (entry point: guard.mjs).
//
// A guard decides on the exact arguments a program will receive. Parsing shell with regular
// expressions is not safe (quotes, newlines, globs, values glued to flags), so `words()` refuses
// everything bash or zsh (the owner's shell) would expand or interpret itself, and splits only what
// is left: plain words, single quotes and double quotes without expansions. For that subset this
// split and both shells agree. Flags are checked against allowlists, never blocklists: a program's
// next release can add a flag that writes files or runs programs.

import path from 'node:path';

// Outside quotes: operators, redirections, substitutions, globs (zsh: ^ with extendedglob), brace
// and tilde expansion, comments, escapes and history. Inside double quotes: substitutions, escapes
// and history. `=` starting a word expands to a command path in zsh.
const UNQUOTED = new Set(';&|<>()`$*?[]{}~#\\!^');
const IN_DOUBLE = new Set('`$\\!');
// eslint-disable-next-line no-control-regex -- control characters are what this rejects
const CONTROL = /[\x00-\x08\x0a-\x1f\x7f]/;

export class Blocked extends Error {}

/** The argument list the shell would build, or Blocked if the command needs the shell's help. */
export function words(cmd) {
  if (typeof cmd !== 'string') throw new Blocked('no command');
  if (CONTROL.test(cmd)) throw new Blocked('no newlines or control characters');
  const out = [];
  let word = null; // null between words; '' is a started (possibly empty) word
  let quote = null; // null, "'" or '"'
  for (const ch of cmd) {
    if (quote === "'") {
      if (ch === "'") quote = null;
      else word += ch;
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      else if (IN_DOUBLE.has(ch)) {
        throw new Blocked(`${JSON.stringify(ch)} inside double quotes: use single quotes`);
      } else word += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      word ??= '';
    } else if (ch === ' ' || ch === '\t') {
      if (word !== null) out.push(word);
      word = null;
    } else if (UNQUOTED.has(ch) || (ch === '=' && word === null)) {
      throw new Blocked(
        `${JSON.stringify(ch)} outside quotes: one plain command per call, no globs or expansions; ` +
          'put patterns, URLs and bodies in single quotes',
      );
    } else {
      word = (word ?? '') + ch;
    }
  }
  if (quote) throw new Blocked('unbalanced quote');
  if (word !== null) out.push(word);
  return out;
}

/**
 * True if any path part of the word names a secret file. Parts are split at / = : and a leading @
 * (curl reads @file), and compared case-insensitively (macOS file systems ignore case). A value
 * glued to a short flag (-S.env) is checked too.
 */
export function isSecret(word) {
  const candidates = /^-[^-]/.test(word) ? [word, word.slice(2)] : [word];
  return candidates.some((w) =>
    w
      .toLowerCase()
      .split(/[/=:@]/)
      .some(
        (part) =>
          part === 'vault.yml' ||
          part === '.env' ||
          (part.startsWith('.env.') && part !== '.env.example'),
      ),
  );
}

export function projectDir() {
  const dir = process.env.CLAUDE_PROJECT_DIR;
  if (!dir) throw new Blocked('CLAUDE_PROJECT_DIR is not set');
  return path.resolve(dir);
}

/**
 * Checks a program's arguments against an allowlist and returns the positional ones.
 * `short`: letters of value-less short flags (may be bundled: -in). `long`: value-less long flags.
 * `withValue`: flags whose value is the next word (or after = for long ones).
 * Anything else starting with - is refused, including abbreviations of long flags. After `--`,
 * everything is positional.
 */
export function allowFlags(prog, args, { short = '', long = [], withValue = [] }) {
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (!a.startsWith('-') || a === '-') {
      positional.push(a);
    } else if (withValue.includes(a)) {
      if (i + 1 >= args.length) throw new Blocked(`${prog} ${a} needs a value`);
      i++;
    } else if (a.startsWith('--') && a.includes('=') && withValue.includes(a.split('=')[0])) {
      // --flag=value
    } else if (long.includes(a)) {
      // allowed
    } else if (!a.startsWith('--') && [...a.slice(1)].every((c) => short.includes(c))) {
      // bundled short flags
    } else {
      const allowed = [...[...short].map((c) => `-${c}`), ...long, ...withValue].join(' ');
      throw new Blocked(`${prog} flag ${a} is not allowed; allowed: ${allowed}`);
    }
  }
  return positional;
}
