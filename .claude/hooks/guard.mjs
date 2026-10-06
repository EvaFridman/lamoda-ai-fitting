// Entry point of the agents' PreToolUse guards: `node guard.mjs <rules>` with the hook input on
// stdin. Exits 0 to allow and 2 to block (the reason on stderr goes to the agent).
//
// It always runs the check: no "am I the main module" test, which an older Node could skip and so
// allow everything. Any error blocks, and the hook command in the agent file adds `|| exit 2`, so a
// guard that cannot start (no node, a syntax error) blocks too.

import { Blocked } from './guard-lib.mjs';
import { check as main } from './main-rules.mjs';
import { check as qaTester } from './qa-tester-rules.mjs';
import { check as readOnly } from './read-only-rules.mjs';
import { check as testWriter } from './test-writer-rules.mjs';

const RULES = { main, 'read-only': readOnly, 'qa-tester': qaTester, 'test-writer': testWriter };

const name = process.argv[2];
try {
  if (!Object.hasOwn(RULES, name)) throw new Blocked(`unknown rules ${JSON.stringify(name)}`);
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const data = JSON.parse(raw);
  RULES[name](data.tool_name ?? '', data.tool_input ?? {});
} catch (e) {
  const reason = e instanceof Blocked ? e.message : `guard error ${e}`;
  process.stderr.write(`Blocked by .claude/hooks/guard.mjs ${name}: ${reason}\n`);
  process.exit(2);
}
process.exit(0);
