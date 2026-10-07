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
    if (q) {
      if (c === q) q = null;
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
  let quote = null;
  let herestringNext = false;

  const pushWord = () => {
    if (word !== null) {
      if (herestringNext) herestrings.push({ segment, index: segment.length });
      herestringNext = false;
      segment.push({ text: word, glob, brace });
    }
    word = null;
    glob = false;
    brace = false;
  };
  const endSegment = () => {
    pushWord();
    if (segment.length > 0) segments.push(segment);
    segment = [];
  };
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
    // Substitutions run outside quotes and inside double quotes.
    if (ch === '$' && line[i + 1] === '(') {
      const end = closingParen(line, i + 1);
      code.push(line.slice(i + 2, end));
      append('$()');
      i = end;
      continue;
    }
    if (ch === '`') {
      const end = line.indexOf('`', i + 1);
      code.push(line.slice(i + 1, end === -1 ? line.length : end));
      append('``');
      i = end === -1 ? line.length : end;
      continue;
    }
    if (ch === '\\') {
      if (line[i + 1] === '\n')
        i++; // line continuation: nothing
      else if (i + 1 < line.length) append(line[++i]);
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else append(ch);
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
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
    } else if (';&|()'.includes(ch)) {
      endSegment();
    } else if (ch === '<' || ch === '>') {
      pushWord();
    } else if (ch === '#' && word === null) {
      const eol = line.indexOf('\n', i);
      i = (eol === -1 ? line.length : eol) - 1;
    } else {
      if ('*?['.includes(ch)) glob = true;
      if (ch === '{') brace = true;
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

function checkSegment(seg) {
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
    lw.some((x) => x.startsWith('--no-ignore') || /^-u+$/.test(x) || x === '--unrestricted')
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
    (has('token') || (has('status') && (has('-t') || has('--show-token'))))
  ) {
    block('printing the GitHub token');
  }

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

function checkLine(line, depth) {
  if (depth > MAX_DEPTH) throw new Blocked('command nested too deeply');
  const { segments, code } = split(line);
  segments.forEach(checkSegment);
  checkFindReaders(segments);
  for (const c of code) checkLine(c, depth + 1);
}

export function check(tool, input) {
  if (tool !== 'Bash') return;
  if (typeof input.command !== 'string') throw new Blocked('no command');
  checkLine(input.command, 0);
}
