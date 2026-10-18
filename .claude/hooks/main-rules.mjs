// Rules for Bash in the main session (hook in .claude/settings.json; it also runs for subagents).
//
// The main session needs full shell, so this is a blocklist of what destroys data, skips the
// project's checks or prints secrets, even when a tool output, a skill or a web page says it is
// fine. It guards against mistakes, not against a determined bypass: the agents' allowlists
// (*-rules.mjs) are the strict ones, and GitHub protects `main` (no force push, required checks).
//
// It does not parse shell structure. It splits the line into words and operators and looks for
// dangerous word sequences between two operators, wherever they stand: after `do`, `xargs`,
// `timeout`, `docker compose exec` alike. A quoted string with spaces is one word, so a commit
// message that mentions a blocked command does not match. Code inside $(...), backticks,
// `sh -c '...'`, `eval`, here-strings and heredocs read by a shell is checked the same way.

import path from 'node:path';

import { Blocked, isSecret } from './guard-lib.mjs';

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
// Keywords after which `[[` still starts a command: `if [[ ... ]]`, `! [[ ... ]]`.
const COND_LEAD = ['if', 'elif', 'while', 'until', 'then', 'do', 'else', '!'];
const MAX_DEPTH = 20;
const block = (why) => {
  throw new Blocked(`${why}. If this is really needed, ask the owner to run it by hand.`);
};

// --- Splitting ---------------------------------------------------------------------------------

/** Index of the `)` closing the `(` at `open`, skipping quoted text and heredoc bodies. */
function closingParen(text, open) {
  let depth = 0;
  let q = null;
  for (let j = open; j < text.length; j++) {
    const c = text[j];
    if (q === "$'") {
      if (c === '\\') j++;
      else if (c === "'") q = null;
    } else if (q === '"') {
      // Substitutions run inside double quotes, with quotes of their own.
      if (c === '\\') j++;
      else if (c === '$' && text[j + 1] === '(') j = closingParen(text, j + 1);
      else if (c === '`') {
        const end = text.indexOf('`', j + 1);
        j = end === -1 ? text.length : end;
      } else if (c === q) q = null;
    } else if (q) {
      if (c === q) q = null;
    } else if (c === '\\') {
      j++; // \) \' \$ are plain characters
    } else if (c === '$' && text[j + 1] === "'") {
      q = "$'";
      j++;
    } else if (c === "'" || c === '"') q = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return j;
    else if (c === '<' && text.startsWith('<<', j) && text[j + 2] !== '<') {
      // A heredoc body may hold ) or an apostrophe ("1) don't"): jump past its delimiter line.
      const m = /^<<-?\s*(['"]?)([\w.-]+)\1/.exec(text.slice(j));
      if (!m) continue;
      let eol = text.indexOf('\n', j);
      while (eol !== -1) {
        const next = text.indexOf('\n', eol + 1);
        const l = text.slice(eol + 1, next === -1 ? text.length : next);
        if (l.replace(/^\t+/, '') === m[2]) {
          j = (next === -1 ? text.length : next) - 1;
          break;
        }
        eol = next;
      }
      if (eol === -1) return text.length;
    }
  }
  return text.length;
}

/**
 * [from, to) ranges of the insides of `[[ ... ]]`, where the shell expands no glob (a regex after
 * =~ is not one). Found conservatively, anything else keeps its globs: `[[` where a command starts
 * (the line's start, after ; && || | or a newline, then only keywords of COND_LEAD), with no quote,
 * backslash or substitution before it, on a line without `case` (a pattern may read `[[`);
 * inside, nothing that runs or ends a command (` $( <(
 * >( =( << ; a newline, a single & or |), balanced parentheses, closed by a `]]` word.
 */
function condSpans(line) {
  if (/(^|[\s;&|(])case(\s|$)/.test(line)) return [];
  const spans = [];
  for (let at = line.indexOf('[['); at !== -1; at = line.indexOf('[[', at + 2)) {
    if (![' ', '\t'].includes(line[at + 2])) continue;
    const trim = (s) => s.replace(/[ \t]+$/, '');
    let before = trim(line.slice(0, at));
    for (;;) {
      const lead = COND_LEAD.find(
        (k) => before.endsWith(k) && /^$|[\s;&|]$/.test(before.slice(0, -k.length)),
      );
      if (!lead) break;
      before = trim(before.slice(0, -lead.length));
    }
    // split() tracks quotes and escapes from the line's start, this scan from `[[`: they agree
    // only on a prefix without them (`\;` or `'; [[ x'` is no command start for the shell).
    if (/['"\\`]|\$\(/.test(line.slice(0, at))) continue;
    // An operator, not a redirection's tail (`>|`, `>&`: `[[` is a file name there).
    if (!/^$|[;&|\n]$/.test(before) || /[<>][&|]$/.test(before)) continue;
    let depth = 0;
    let q = null;
    for (let j = at + 2; j < line.length; j++) {
      const c = line[j];
      // $'…' escapes differently from the quotes tracked here.
      if (c === '\n' || c === '`' || (c === '$' && "('".includes(line[j + 1]))) break;
      if (q) {
        if (c === q) q = null;
        else if (q === '"' && c === '\\') j++;
        continue;
      }
      if (c === "'" || c === '"') q = c;
      else if (c === '\\') j++;
      else if (c === ';' || ('<>='.includes(c) && line[j + 1] === '(') || line.startsWith('<<', j))
        break;
      else if (c === '&' || c === '|') {
        if (line[j + 1] !== c) break;
        j++;
      } else if (c === '(') depth++;
      else if (c === ')' && --depth < 0) break;
      else if (line.startsWith(']]', j)) {
        // Any other `]]` (`(x)]]`, `]]>file`) may close it for the shell: no span then.
        if (depth === 0 && /\s/.test(line[j - 1]) && /^$|[\s;&|]/.test(line[j + 2] ?? '')) {
          spans.push([at + 2, j]);
        }
        break;
      }
    }
  }
  return spans;
}

// Codes of the letter escapes of $'…' (bash): \n \t \r \a \b \e \E \f \v.
const ANSI_LETTERS = { n: 10, t: 9, r: 13, a: 7, b: 8, e: 27, E: 27, f: 12, v: 11 };
/**
 * The text an escape of $'…' stands for, `c` the character after the backslash (the shell's lexer
 * takes exactly that one). Codes (\xHH, \uHHHH, \UHHHHHHHH, octal, \cX) are refused: shells
 * differ in how they decode them (bytes, NUL cutting the word), so the word's text is unknown.
 */
function ansiEscape(c) {
  if (/[xuUc0-7]/.test(c)) block(`the escape \\${c} in $'…' hides what the word says`);
  if (c in ANSI_LETTERS) return String.fromCodePoint(ANSI_LETTERS[c]);
  if (`\\'"?`.includes(c)) return c;
  return `\\${c}`; // the shell keeps the backslash of an unknown escape
}

/** The contents of $(...) and backticks in text where only those run (an unquoted heredoc). */
function substitutions(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && text[i + 1] === '(') {
      const end = closingParen(text, i + 1);
      out.push(text.slice(i + 2, end));
      i = end;
    } else if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      out.push(text.slice(i + 1, end === -1 ? text.length : end));
      i = end === -1 ? text.length : end;
    }
  }
  return out;
}

/**
 * Splits a command line into segments (word lists between operators) and pieces of code found
 * inside it. A word is { text, glob } where glob marks unquoted * ? [ characters.
 */
function split(line) {
  const segments = [];
  const code = []; // strings that the shell will run as commands
  const heredocs = []; // opened, body not read yet: { delim, quoted, segment }
  const bodies = []; // read: { quoted, segment, body }
  const herestrings = []; // { segment, index }: the word after <<<
  let segment = [];
  let word = null;
  let glob = false;
  let brace = false;
  let expand = false; // a $ or backtick the shell expands: the word's text is not what runs
  let quoted = false; // quotes or a backslash: the word as typed differs from its text
  let quote = null;
  let herestringNext = false;

  const pushWord = () => {
    if (word !== null) {
      if (herestringNext) herestrings.push({ segment, index: segment.length });
      herestringNext = false;
      segment.push({ text: word, glob, brace, expand, quoted });
    }
    word = null;
    glob = false;
    brace = false;
    expand = false;
    quoted = false;
  };
  const endSegment = () => {
    pushWord();
    if (segment.length > 0) segments.push(segment);
    segment = [];
  };
  const spans = condSpans(line);
  const inCond = (i) => spans.some(([from, to]) => i >= from && i < to);
  const append = (c) => {
    word = (word ?? '') + c;
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else append(ch);
      continue;
    }
    // ANSI-C quoting: a backslash escapes the next character (\' is no closing quote); escapes are
    // decoded, so the secret checks see what the shell passes on.
    if (quote === "$'") {
      if (ch === "'") quote = null;
      else if (ch === '\\' && i + 1 < line.length) append(ansiEscape(line[++i]));
      else append(ch);
      continue;
    }
    if (quote === null && ch === '$' && line[i + 1] === "'") {
      quote = "$'";
      quoted = true;
      expand = true;
      word ??= '';
      i++;
      continue;
    }
    // Substitutions run outside quotes and inside double quotes.
    if (ch === '$' && line[i + 1] === '(') {
      const end = closingParen(line, i + 1);
      code.push(line.slice(i + 2, end));
      append('$()');
      expand = true;
      i = end;
      continue;
    }
    if (ch === '`') {
      const end = line.indexOf('`', i + 1);
      code.push(line.slice(i + 1, end === -1 ? line.length : end));
      append('``');
      expand = true;
      i = end === -1 ? line.length : end;
      continue;
    }
    if (ch === '\\') {
      if (line[i + 1] === '\n')
        i++; // line continuation: nothing
      else if (i + 1 < line.length) {
        append(line[++i]);
        quoted = true;
      }
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else append(ch);
      if (ch === '$') expand = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      quoted = true;
      word ??= '';
    } else if (ch === ' ' || ch === '\t' || ch === '\r') {
      pushWord();
    } else if (ch === '\n') {
      endSegment();
      // Heredoc bodies follow the line that opened them.
      while (heredocs.length > 0) {
        const doc = heredocs.shift();
        let j = i + 1;
        let body = '';
        for (;;) {
          const eol = line.indexOf('\n', j);
          const l = line.slice(j, eol === -1 ? line.length : eol);
          if (l.replace(/^\t+/, '') === doc.delim || eol === -1) {
            i = eol === -1 ? line.length : eol;
            break;
          }
          body += `${l}\n`;
          j = eol + 1;
        }
        bodies.push({ ...doc, body });
      }
    } else if (ch === '<' && line.startsWith('<<<', i)) {
      pushWord();
      herestringNext = true;
      i += 2;
    } else if (ch === '<' && line[i + 1] === '<') {
      const m = /^<<-?\s*(['"]?)([\w.-]+)\1/.exec(line.slice(i));
      pushWord();
      if (m) {
        heredocs.push({ delim: m[2], quoted: m[1] !== '', segment });
        i += m[0].length - 1;
      } else i++;
    } else if ('()'.includes(ch) && inCond(i)) {
      // Grouping inside `[[ ]]`, or a regex's group after =~: part of the word.
      append(ch);
    } else if (';&|()'.includes(ch)) {
      endSegment();
    } else if (ch === '<' || ch === '>') {
      pushWord();
    } else if (ch === '#' && word === null) {
      const eol = line.indexOf('\n', i);
      i = (eol === -1 ? line.length : eol) - 1;
    } else {
      if ('*?['.includes(ch) && !inCond(i)) glob = true;
      if (ch === '{') brace = true;
      if (ch === '$') expand = true;
      append(ch);
    }
  }
  endSegment();

  const hasShell = (seg) => seg.some((w) => SHELLS.has(path.basename(w.text)));
  for (const seg of segments) {
    const texts = seg.map((w) => w.text);
    // sh -c '<code>' (or -lc, -ec ...) anywhere in the segment; eval <words>.
    texts.forEach((t, k) => {
      if (SHELLS.has(path.basename(t))) {
        const c = texts.findIndex((a, n) => n > k && /^-[a-z]*c[a-z]*$/.test(a));
        if (c !== -1 && texts[c + 1] !== undefined) code.push(texts[c + 1]);
      }
      if (t === 'eval') code.push(texts.slice(k + 1).join(' '));
      // npx -c '<code>', npm exec -c '<code>' (also --call) run the string in a shell.
      if (['npx', 'npm'].includes(path.basename(t))) {
        const c = texts.findIndex((a, n) => n > k && (a === '-c' || a === '--call'));
        if (c !== -1 && texts[c + 1] !== undefined) code.push(texts[c + 1]);
        const eq = texts.find((a, n) => n > k && a.startsWith('--call='));
        if (eq) code.push(eq.slice('--call='.length));
      }
      // ssh [options] host <command words>: the words run in the remote shell.
      if (path.basename(t) === 'ssh') {
        const withValue = new Set([
          '-b',
          '-c',
          '-D',
          '-E',
          '-e',
          '-F',
          '-I',
          '-i',
          '-J',
          '-L',
          '-l',
          '-m',
          '-O',
          '-o',
          '-p',
          '-Q',
          '-R',
          '-S',
          '-W',
          '-w',
        ]);
        let n = k + 1;
        while (texts[n]?.startsWith('-')) n += withValue.has(texts[n]) ? 2 : 1;
        if (texts[n + 1] !== undefined) code.push(texts.slice(n + 1).join(' '));
      }
    });
  }
  for (const { segment: seg, index } of herestrings) {
    if (hasShell(seg) && seg[index]) code.push(seg[index].text);
  }
  // A heredoc is code when a shell reads it, directly or down a pipe (`cat <<EOF | sh`).
  const lineHasShell = segments.some(hasShell);
  for (const doc of bodies) {
    if (lineHasShell) code.push(doc.body);
    else if (!doc.quoted) code.push(...substitutions(doc.body));
  }
  return { segments, code };
}

// --- Matching ----------------------------------------------------------------------------------

/**
 * Glob match of one path component, without RegExp; [...] classes with ranges and ! or ^
 * negation; an unclosed [ is a literal. In the shell (bash and zsh defaults) * and ? never match a
 * leading dot unless the pattern starts with one; `find -name` and `--exclude` use fnmatch, where
 * they do: pass { dotfiles: true }.
 */
export function globMatch(pattern, name, { dotfiles = false } = {}) {
  if (!dotfiles && name.startsWith('.') && !pattern.startsWith('.')) return false;
  const p = pattern.toLowerCase();
  const s = name.toLowerCase();
  // dp[j]: pattern prefix (consumed so far) matches s[0..j)
  let dp = Array.from({ length: s.length + 1 }, (_, j) => j === 0);
  for (let i = 0; i < p.length;) {
    let next = Array.from({ length: s.length + 1 }, () => false);
    const c = p[i];
    let step = 1;
    if (c === '*') {
      let seen = false;
      for (let j = 0; j <= s.length; j++) {
        seen ||= dp[j];
        next[j] = seen;
      }
    } else {
      let test = (ch) => ch === c;
      if (c === '?') test = () => true;
      if (c === '[') {
        const end = p.indexOf(']', i + 2);
        if (end !== -1) {
          let body = p.slice(i + 1, end);
          const negate = body[0] === '!' || body[0] === '^';
          if (negate) body = body.slice(1);
          test = (ch) => {
            let hit = false;
            for (let k = 0; k < body.length; k++) {
              if (body[k + 1] === '-' && k + 2 < body.length) {
                hit ||= ch >= body[k] && ch <= body[k + 2];
                k += 2;
              } else hit ||= ch === body[k];
            }
            return hit !== negate;
          };
          step = end - i + 1;
        }
      }
      for (let j = 1; j <= s.length; j++) next[j] = dp[j - 1] && test(s[j - 1]);
    }
    dp = next;
    i += step;
  }
  return dp[s.length];
}

const DOT_SECRETS = ['.env', '.env.local', '.env.production', '.env.development'];
const SECRET_NAMES = [...DOT_SECRETS, 'vault.yml'];
// `*.yml` stands for workflow and compose files, not for the vault: only a pattern that names it
// (vault*, v?ult.yml) counts.
const globHitsSecret = (pattern, opts) => {
  const name = pattern.split('/').pop();
  return SECRET_NAMES.some(
    (n) => globMatch(name, n, opts) && !(n === 'vault.yml' && name.startsWith('*')),
  );
};
// An --exclude pattern keeps secrets out only if it covers every .env variant (.env* does,
// .env does not).
const excludesSecrets = (pattern) =>
  DOT_SECRETS.every((n) => globMatch(pattern.replace(/^['"]|['"]$/g, ''), n, { dotfiles: true }));

/** Brace expansion of a word as the shell does it: a{b,c}d -> abd acd (nested, capped). */
function expandBraces(word, limit = 64) {
  let depth = 0;
  let open = -1;
  const commas = [];
  for (let i = 0; i < word.length; i++) {
    if (word[i] === '{') {
      if (depth++ === 0) open = i;
    } else if (word[i] === '}' && depth > 0 && --depth === 0) {
      if (commas.length === 0) return [word];
      const parts = [];
      let from = open + 1;
      for (const c of [...commas, i]) {
        parts.push(word.slice(from, c));
        from = c + 1;
      }
      const head = word.slice(0, open);
      const tail = word.slice(i + 1);
      return parts.flatMap((p) => expandBraces(head + p + tail, limit)).slice(0, limit);
    } else if (word[i] === ',' && depth === 1) commas.push(i);
  }
  return [word];
}
const short = (w, letter) => /^-[a-z]+$/i.test(w) && w.includes(letter);
const NAME_TESTS = ['-name', '-iname', '-path', '-ipath'];
const READERS = [
  'grep',
  'egrep',
  'fgrep',
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'awk',
  'sed',
  'strings',
  'xxd',
  'od',
];

/**
 * `find ... -exec cat {} +` and `find ... | xargs grep ...` read every file find lists, dotfiles
 * included. Allowed only when find's name tests keep secrets out (-name '*.ts'), or the reader
 * excludes them (grep --exclude='.env*').
 */
function checkFindReaders(segments) {
  segments.forEach((seg, k) => {
    const lw = seg.map((x) => x.text.toLowerCase());
    if (!lw.some((x) => base(x) === 'find')) return;
    const names = lw.flatMap((x, i) =>
      NAME_TESTS.includes(x) && !['-not', '!'].includes(lw[i - 1]) && seg[i + 1]
        ? [seg[i + 1].text]
        : [],
    );
    const exec = lw.findIndex((x) => ['-exec', '-execdir', '-ok', '-okdir'].includes(x));
    const next = (segments[k + 1] ?? []).map((x) => x.text.toLowerCase());
    const reader =
      exec !== -1 && READERS.includes(base(lw[exec + 1] ?? ''))
        ? lw.slice(exec + 1)
        : next.some((x) => base(x) === 'xargs') && next.some((x) => READERS.includes(base(x)))
          ? next
          : null;
    if (!reader) return;
    const filtered = names.length > 0 && names.every((n) => !globHitsSecret(n, { dotfiles: true }));
    const excluded = reader.some(
      (x) => x.startsWith('--exclude=') && excludesSecrets(x.slice('--exclude='.length)),
    );
    if (!filtered && !excluded) {
      block("find passes every file, .env too, to a reader; add -name '*.ts' or use rg");
    }
  });
}
const base = (w) => path.basename(w).replace(/@[^/]*$/, ''); // prisma@7 -> prisma

function checkSegment(seg, depth = 0) {
  const w = seg.map((x) => x.text);
  const all = w.map((x) => x.toLowerCase());
  // A word with spaces is a message or a pattern, not a command or a flag: rules do not see it
  // (blanked, so indexes still match `w` and `all`).
  const lw = all.map((x) => (/\s/.test(x) ? '' : x));
  const has = (x) => lw.includes(x);
  const at = (x) => lw.indexOf(x);
  const after = (x) => (at(x) === -1 ? [] : lw.slice(at(x) + 1));
  const isGit = lw.some((x) => base(x) === 'git');
  const isDocker = lw.some((x) => ['docker', 'docker-compose', 'podman'].includes(base(x)));
  const isCompose = has('compose') || lw.some((x) => base(x) === 'docker-compose');

  // Secrets: a path word, a glob that would expand to one, a search that reaches them.
  seg.forEach(({ text, glob, brace }) => {
    if (/^--(exclude|exclude-dir|glob)=/.test(text)) return;
    for (const word of brace ? expandBraces(text) : [text]) {
      if (!/\s/.test(word) && isSecret(word)) {
        block('secret files are not read or written by Claude');
      }
      if (glob && globHitsSecret(word)) block(`the glob ${word} expands to a secret file`);
    }
  });
  const g = lw.findIndex((x) => ['grep', 'egrep', 'fgrep', 'rgrep'].includes(base(x)));
  if (g !== -1) {
    // Only grep's own flags: `xargs -r grep` is not recursive.
    const recursive =
      base(lw[g]) === 'rgrep' ||
      lw.slice(g + 1).some(
        (x) =>
          short(x, 'r') || // -R too: words are lower-cased
          x.startsWith('--recursive') ||
          x === '--dereference-recursive',
      );
    const excluded = lw.some(
      (x) => x.startsWith('--exclude=') && excludesSecrets(x.slice('--exclude='.length)),
    );
    if (recursive && !excluded)
      block("recursive grep reads .env; use rg (skips git-ignored files) or --exclude='.env*'");
  }
  if (
    lw.some((x) => base(x) === 'rg') &&
    // Case matters here: -u is --unrestricted, -U is --multiline.
    w.some((x) => x.startsWith('--no-ignore') || /^-[a-zA-Z]*u/.test(x) || x === '--unrestricted')
  ) {
    block('rg without ignore files reads .env');
  }
  if (lw.some((x) => base(x) === 'find')) {
    lw.forEach((x, k) => {
      // find matches names with fnmatch: * covers a leading dot. A negated test excludes.
      if (
        NAME_TESTS.includes(x) &&
        !['-not', '!'].includes(lw[k - 1]) &&
        w[k + 1] &&
        globHitsSecret(w[k + 1], { dotfiles: true })
      ) {
        block('find for secret files');
      }
    });
  }
  if (lw.some((x) => base(x) === 'printenv')) block('printing the environment');
  const envAt = lw.findIndex((x) => base(x) === 'env');
  if (
    envAt !== -1 &&
    lw.slice(envAt + 1).every((x) => x.startsWith('-') || /^[a-z_][a-z0-9_]*=/i.test(x))
  ) {
    block('printing the environment');
  }
  if (lw.some((x) => /^\/proc\/.+\/environ$/.test(x))) block('reading a process environment');
  // Code passed to node usually has spaces, so look at every word (`all`), not only `lw`.
  if (
    lw.some((x) => base(x) === 'node') &&
    lw.some((x) => short(x, 'e') || short(x, 'p') || /^--(eval|print)(=|$)/.test(x)) &&
    all.some((x) => x.includes('process.env'))
  ) {
    block('printing process.env');
  }
  // `echo $DATABASE_URL`, often inside `docker compose exec api sh -c '...'`.
  if (
    lw.some((x) => ['echo', 'printf'].includes(base(x))) &&
    w.some((x) => /\$\{?[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY|DATABASE_URL|REDIS_URL|DSN)/.test(x))
  ) {
    block('printing a secret variable');
  }
  if (
    has('gh') &&
    has('auth') &&
    (has('token') ||
      (has('status') && lw.some((x) => short(x, 't') || /^--show-token(=|$)/.test(x))))
  ) {
    block('printing the GitHub token');
  }
  // The token through git's credential helpers, which gh sets up (`gh auth setup-git`), and
  // through the macOS keychain, where gh keeps it.
  if (
    (has('auth') && lw.includes('git-credential')) ||
    (isGit && has('credential') && after('credential').some((x) => ['fill', 'get'].includes(x))) ||
    (isGit && lw.some((x) => /^credential-/.test(x))) ||
    lw.some(
      (x, i) => /^git-credential-/.test(base(x)) && (i === 0 || WRAPPERS.has(base(lw[i - 1]))),
    ) ||
    (has('security') &&
      ['find-generic-password', 'find-internet-password', 'dump-keychain'].some(has))
  ) {
    block('printing the GitHub token');
  }
  // gh runs these as commands (`gh pr view --web` starts the browser with the page's address).
  w.forEach((x) => {
    const m = /^(GH_BROWSER|BROWSER|GH_PAGER|PAGER|GH_EDITOR|EDITOR|VISUAL)=(.*)$/.exec(x);
    if (m && !['', 'cat', 'less', 'more'].includes(m[2])) {
      block(`${m[1]} set to a command: gh and git would run it`);
    }
  });
  // A command whose name the shell builds ($(echo gh) pr merge) hides it from every rule here.
  if (seg[0]?.expand && GH_COMMANDS.has(lw[1])) block('a command name built by the shell');
  lw.forEach((x, i) => {
    // zsh runs `=gh` as the gh found on PATH.
    if (base(x).replace(/^=/, '') === 'gh') checkGh(seg, i, depth);
  });

  // Docker: deleting volumes deletes the database, Redis data, Temporal history and certificates.
  if (has('volume') && after('volume').some((x) => ['rm', 'remove', 'prune'].includes(x))) {
    block('removing docker volumes deletes data');
  }
  if (
    isCompose &&
    has('down') &&
    after('down').some((x) => x.startsWith('--volumes') || short(x, 'v'))
  ) {
    block('compose down with volumes deletes data');
  }
  if (has('system') && has('prune') && lw.some((x) => x.startsWith('--volumes'))) {
    block('pruning docker volumes deletes data');
  }
  if (isCompose && (has('config') || has('convert'))) {
    const listing = [
      '--no-interpolate',
      '-q',
      '--quiet',
      '--services',
      '--volumes',
      '--profiles',
      '--images',
    ];
    if (!lw.some((x) => listing.includes(x)))
      block('compose config prints secrets from .env; add --no-interpolate');
  }
  if (isDocker && has('inspect')) {
    const before = lw[at('inspect') - 1];
    if (['docker', 'container', 'podman'].includes(base(before ?? ''))) {
      const f = lw.findIndex((x) => x === '-f' || x === '--format' || x.startsWith('--format='));
      const template =
        f === -1
          ? null
          : lw[f].startsWith('--format=')
            ? lw[f].slice('--format='.length)
            : (all[f + 1] ?? '');
      if (template === null)
        block('docker inspect prints container environments; select fields with --format');
      // The whole object, all of .Config, or anything naming Env; .Config.Healthcheck is fine.
      if (/env|^\s*json\s*$|\bjson\s+\.\s*}}|{{\s*\.\s*}}|\.config\s*}}/.test(template))
        block('this inspect template prints the environment');
    }
  }

  // Prisma: these drop data or bypass migrations.
  const p = lw.findIndex((x) => base(x) === 'prisma');
  if (p !== -1) {
    const [a, b] = lw.slice(p + 1).filter((x) => !x.startsWith('-'));
    if (a === 'migrate' && b === 'reset') block('prisma migrate reset drops the database');
    if (a === 'db' && b === 'push') block('prisma db push changes the schema without a migration');
  }

  // Git: hooks are the local gate (lint, commit message, secret scan); force pushes rewrite history.
  if (lw.some((x) => /^git_config\w*=/.test(x))) block('git configuration through the environment');
  if (!isGit) return;
  const hookRunners = ['commit', 'push', 'merge', 'pull', 'rebase', 'am', 'cherry-pick', 'revert'];
  // git accepts any unambiguous prefix of a long option.
  if (
    hookRunners.some(has) &&
    lw.some((x) => x.length >= 6 && '--no-verify'.startsWith(x.split('=')[0]))
  ) {
    block('skipping git hooks');
  }
  // -n skips hooks only for `git commit` (in `git log --grep commit -n 5` it is a count).
  const gitAt = lw.findIndex((x) => base(x) === 'git');
  let sub = gitAt + 1;
  while (lw[sub]?.startsWith('-'))
    sub += ['-c', '-C', '--git-dir', '--work-tree'].includes(lw[sub]) ? 2 : 1;
  // git diff/log/show --output=<file> writes any file (abbreviations included: --outp).
  if (
    ['diff', 'log', 'show'].includes(lw[sub]) &&
    lw.some((x) => {
      const name = x.split('=')[0];
      return name.length >= 6 && '--output'.startsWith(name);
    })
  ) {
    block('git --output writes a file; redirect with > if a file is really needed');
  }
  // git grep --no-index searches ignored files (.env) unless told otherwise.
  if (lw[sub] === 'grep' && has('--no-index') && !has('--exclude-standard')) {
    block('git grep --no-index reads .env; add --exclude-standard or use rg');
  }
  if (lw[sub] === 'commit' && lw.slice(sub + 1).some((x) => short(x, 'n'))) {
    block('skipping git hooks (-n)');
  }
  if (
    has('push') &&
    after('push').some(
      (x) => x.startsWith('--forc') || short(x, 'f') || (x.startsWith('+') && x.length > 1),
    )
  ) {
    block('force push rewrites history');
  }
  if (
    has('config') &&
    ['remove-section', '--remove-section', 'rename-section', '--rename-section'].some(has) &&
    has('core')
  ) {
    block('removing the git core section drops the hooks path');
  }
  const key = lw.findIndex((x) => x.includes('core.hookspath'));
  if (key !== -1) {
    const readOrReset =
      has('config') &&
      lw[key] === 'core.hookspath' &&
      !['--unset', '--unset-all', 'unset', '--replace-all'].some(has) &&
      lw
        .slice(key + 1)
        .filter((x) => !x.startsWith('-'))
        .every((x) => x === '.githooks');
    if (!readOrReset) block('changing or overriding the git hooks path');
  }
}

// gh (the apply-review skill pulls review text from GitHub into the context, so a write must not
// slip past the owner). Its write commands ask (settings.json), and an ask rule sees only a
// command's prefix: so a write is the segment's first word, a group's subcommand comes right after
// it (`gh pr -R x merge` would not match `gh pr merge`), and only gh's own commands run (an alias
// can stand for anything). Reads pass anywhere. `gh api` only reads: one path, --paginate and
// --jq; it writes with -X/--method, fields (-f, -F, --field, --raw-field), --input and graphql.
const GH_COMMANDS = new Set([
  'api', 'alias', 'attestation', 'auth', 'browse', 'cache', 'codespace', 'completion', 'config',
  'extension', 'ext', 'gist', 'gpg-key', 'help', 'issue', 'label', 'org', 'pr', 'project',
  'release', 'repo', 'ruleset', 'run', 'search', 'secret', 'ssh-key', 'status', 'variable',
  'version', 'workflow',
]); // prettier-ignore
const GH_SINGLE = new Set(['api', 'browse', 'completion', 'help', 'status', 'version']);
const GH_READS = new Set([
  'pr view', 'pr list', 'pr diff', 'pr checks', 'pr status', 'issue view', 'issue list',
  'issue status', 'run view', 'run list', 'run watch', 'repo view', 'release view', 'release list',
  'workflow view', 'workflow list', 'label list', 'gist view', 'gist list', 'cache list',
  'secret list', 'variable list', 'variable get', 'ruleset list', 'ruleset view', 'search repos',
  'search issues', 'search prs', 'search code', 'search commits', 'alias list', 'extension list',
  'ext list', 'auth status', 'config get', 'config list', 'org list',
]); // prettier-ignore
// The writes that ask: exactly the gh entries of `ask` in settings.json (a group alone covers all
// its subcommands; guards.test.mjs compares the two). Anything neither read nor here is refused.
export const GH_WRITES = new Set([
  'pr merge', 'pr create', 'pr review', 'pr comment', 'pr edit', 'pr close', 'pr reopen',
  'pr ready', 'pr lock', 'pr unlock', 'pr update-branch', 'issue create', 'issue comment',
  'issue edit', 'issue close', 'issue reopen', 'issue delete', 'issue transfer', 'issue lock',
  'issue unlock', 'issue pin', 'issue unpin', 'issue develop', 'label', 'gist', 'variable',
  'cache', 'ssh-key', 'gpg-key', 'project', 'codespace', 'attestation', 'run rerun', 'run cancel',
  'run delete', 'workflow', 'release', 'repo', 'secret',
]); // prettier-ignore
// Groups whose only allowed use is a read above: anything else of theirs is refused, not asked.
const GH_READ_ONLY_GROUPS = new Set(['alias', 'extension', 'ext', 'auth', 'config']);
const HELP = ['--help', '-h'];
// Words after which the next one runs as a command (`timeout 30 gh`, `find -exec gh`).
const WRAPPERS = new Set([
  'env', 'command', 'exec', 'builtin', 'xargs', 'parallel', 'timeout', 'nice', 'nohup', 'time',
  'sudo', 'then', 'do', 'else', '!', '{', '-exec', '-execdir', '-ok', '-okdir', '--exec', '-x',
]); // prettier-ignore
// These add words to the command that the hook never sees.
const ARG_ADDERS = new Set([
  'xargs',
  'parallel',
  '-exec',
  '-execdir',
  '-ok',
  '-okdir',
  '--exec',
  '-x',
]);
const shellBuiltWord = (x) =>
  x.expand || x.glob || (x.brace && (expandBraces(x.text).length > 1 || x.text.includes('..')));

function checkGh(seg, at, depth) {
  const w = seg.map((x) => x.text);
  const lw = w.map((x) => x.toLowerCase());
  const before = lw.slice(0, at).map((x) => base(x));
  // `gh` as an argument (`rg -n gh`, `brew info gh`) is not checked; after variable assignments
  // (`GH_REPO=x gh`) or a wrapper it is the command.
  const assignments = (x) => /^[a-z_][a-z0-9_]*=/.test(x);
  if (at !== 0 && !lw.slice(0, at).every(assignments) && !before.some((x) => WRAPPERS.has(x))) {
    return;
  }
  if (before.some((x) => ARG_ADDERS.has(x))) block('gh run by xargs, parallel or -exec');
  const shellBuilt = seg.slice(at + 1).some(shellBuiltWord);
  const [cmd, sub] = lw.slice(at + 1, at + 3);
  if (cmd === undefined) return;
  if (cmd.startsWith('-')) {
    if (cmd === '--version' || HELP.includes(cmd)) return;
    block('gh: a flag before the command hides it from the ask rules');
  }
  if (!GH_COMMANDS.has(cmd)) block(`gh ${cmd}: not a gh command (an alias can stand for anything)`);
  if (cmd === 'api') {
    if (shellBuilt) block('gh api: its words must be plain text here');
    let paths = 0;
    for (let i = at + 2; i < w.length; i++) {
      const x = w[i];
      if (x === '--paginate' || /^--jq=/.test(x)) continue;
      if (x === '--jq' || x === '-q') {
        i++;
        continue;
      }
      if (
        x.startsWith('-') ||
        /^\/?graphql$/i.test(x) ||
        !/^\/?[A-Za-z0-9_.{}/-]+(\?[A-Za-z0-9_=&%.,-]*)?$/.test(x) ||
        ++paths > 1
      ) {
        block('gh api only reads here: a path, --paginate and --jq');
      }
    }
    return;
  }
  if (GH_SINGLE.has(cmd)) return;
  if (sub?.startsWith('-') && !HELP.includes(sub)) {
    block(`gh ${cmd}: a flag before the subcommand hides it from the ask rules`);
  }
  if (sub === undefined || HELP.includes(sub)) return;
  if (GH_READS.has(`${cmd} ${sub}`)) {
    // gh config get oauth_token prints a token kept outside the keychain.
    if (cmd === 'config' && lw.slice(at + 3).includes('oauth_token'))
      block('printing the GitHub token');
    return;
  }
  if (GH_READ_ONLY_GROUPS.has(cmd)) block(`gh ${cmd} ${sub}: only reads of gh ${cmd} run here`);
  if (!GH_WRITES.has(`${cmd} ${sub}`) && !GH_WRITES.has(cmd)) {
    block(`gh ${cmd} ${sub}: neither a known read nor a write that asks`);
  }
  // The ask rule compares the command's text: `gh <group> <subcommand>` typed as is, first in its
  // command and not inside sh -c, eval or $(...), whose prefix is the outer command's.
  const typed = seg.slice(at, at + 3).every((x) => !x.quoted && !shellBuiltWord(x));
  if (at !== 0 || depth > 0 || w[at] !== 'gh' || !typed) {
    block(`gh ${cmd} ${sub} writes: it starts the command, typed as is, so its ask rule applies`);
  }
}

function checkLine(line, depth) {
  if (depth > MAX_DEPTH) throw new Blocked('command nested too deeply');
  const { segments, code } = split(line);
  segments.forEach((seg) => checkSegment(seg, depth));
  checkFindReaders(segments);
  for (const c of code) checkLine(c, depth + 1);
}

export function check(tool, input) {
  if (tool !== 'Bash') return;
  if (typeof input.command !== 'string') throw new Blocked('no command');
  checkLine(input.command, 0);
}
