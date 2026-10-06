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

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);

/**
 * Lenient split of any shell command line into simple commands, for the main session's guard,
 * which has to allow full shell. Returns [{ argv, globbed }] where `globbed` holds the indexes of
 * words with unquoted glob characters. Splits at ; & | ( ) and newlines; the contents of $(...),
 * backticks and `sh -c`/`eval` strings are split as commands of their own; heredoc bodies are
 * skipped unless a shell reads them. Best effort against mistakes, not a parser of every shell
 * feature: words() above is the strict one.
 */
export function commands(line) {
  const out = [];
  const heredocs = []; // { delim, strip, seg }
  let seg = { argv: [], globbed: new Set() };
  let word = null;
  let glob = false;
  let quote = null;

  const pushWord = () => {
    if (word !== null) {
      if (glob) seg.globbed.add(seg.argv.length);
      seg.argv.push(word);
    }
    word = null;
    glob = false;
  };
  const endSeg = () => {
    pushWord();
    if (seg.argv.length > 0) out.push(seg);
    seg = { argv: [], globbed: new Set() };
  };
  // Index of the bracket closing the one at `open`, counting nesting and skipping quotes.
  const closing = (open) => {
    let depth = 0;
    let q = null;
    for (let j = open; j < line.length; j++) {
      const c = line[j];
      if (q) {
        if (c === q) q = null;
      } else if (c === "'" || c === '"') q = c;
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) return j;
    }
    return line.length;
  };
  const sub = (text) => out.push(...commands(text));

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else word += ch;
      continue;
    }
    if (ch === '$' && line[i + 1] === '(') {
      const end = closing(i + 1);
      sub(line.slice(i + 2, end));
      word = (word ?? '') + '$()';
      i = end;
      continue;
    }
    if (ch === '`') {
      const end = line.indexOf('`', i + 1);
      sub(line.slice(i + 1, end === -1 ? line.length : end));
      word = (word ?? '') + '``';
      i = end === -1 ? line.length : end;
      continue;
    }
    if (ch === '\\' && i + 1 < line.length) {
      word = (word ?? '') + line[++i];
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else word += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      word ??= '';
    } else if (ch === ' ' || ch === '\t') {
      pushWord();
    } else if (ch === '\n') {
      endSeg();
      // Heredoc bodies start after the line that opened them.
      while (heredocs.length > 0) {
        const { delim, strip, owner } = heredocs.shift();
        const bodyStart = i + 1;
        let j = bodyStart;
        for (;;) {
          const eol = line.indexOf('\n', j);
          const l = line.slice(j, eol === -1 ? line.length : eol);
          if ((strip ? l.replace(/^\t+/, '') : l) === delim || eol === -1) {
            if (SHELLS.has(path.basename(owner.argv[0] ?? ''))) sub(line.slice(bodyStart, j));
            i = eol === -1 ? line.length : eol;
            break;
          }
          j = eol + 1;
        }
      }
    } else if (ch === '<' && line[i + 1] === '<' && line[i + 2] !== '<') {
      const m = /^<<(-?)\s*(['"]?)([\w.-]+)\2/.exec(line.slice(i));
      if (m) {
        heredocs.push({ delim: m[3], strip: m[1] === '-', owner: seg });
        pushWord();
        i += m[0].length - 1;
      } else {
        pushWord();
      }
    } else if (';&|()\n'.includes(ch)) {
      endSeg();
    } else if (ch === '<' || ch === '>') {
      pushWord();
    } else if (ch === '#' && word === null) {
      const eol = line.indexOf('\n', i);
      i = (eol === -1 ? line.length : eol) - 1;
    } else {
      if ('*?['.includes(ch)) glob = true;
      word = (word ?? '') + ch;
    }
  }
  endSeg();

  // sh -c '<code>', bash -lc '<code>', eval <code>: the string is code.
  for (const { argv } of [...out]) {
    const prog = path.basename(argv[0] ?? '');
    if (prog === 'eval') sub(argv.slice(1).join(' '));
    if (SHELLS.has(prog)) {
      const c = argv.findIndex((a, k) => k > 0 && /^-[a-z]*c[a-z]*$/.test(a));
      if (c !== -1 && argv[c + 1] !== undefined) sub(argv[c + 1]);
    }
  }
  return out;
}
