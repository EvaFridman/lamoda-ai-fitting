// Runs the shell commands it gets at the same time (root `npm test` runs the api and web tests so).
// Each command's output (stdout and stderr) is kept and printed as one block with a header when
// that command ends, in the order they end, so a failure's report is not interleaved with the other
// command's lines. Exits 1 if any command failed, naming which. On SIGINT, SIGTERM or SIGHUP it
// passes the signal on, prints what each unfinished command wrote so far, and exits 128 + the
// signal's number. Each command runs in its own process group (and session, so the terminal's
// signals reach it only through this script) and the signal goes to the whole group: a shell (dash,
// `sh` on Debian and Ubuntu, does not exec its last command) or `npm run` would otherwise leave the
// processes under it running after it is stopped. A SIGKILL of this script leaves them running.
//
// Usage: node scripts/run-parallel.mjs "<command>" "<command>" ...

import { spawn } from 'node:child_process';
import os from 'node:os';

const commands = process.argv.slice(2);
if (commands.length === 0) {
  console.error('Usage: node scripts/run-parallel.mjs "<command>" ["<command>" ...]');
  process.exit(1);
}

// Output goes to a pipe, so tools would drop colors; keep them when the caller is a terminal.
const env =
  process.stdout.isTTY && !('FORCE_COLOR' in process.env) && !('NO_COLOR' in process.env)
    ? { ...process.env, FORCE_COLOR: '1' }
    : process.env;

/** Commands still running: their child, and how to print their block so far. */
const running = new Set();
/** Set by SIGINT, SIGTERM or SIGHUP: the commands are being stopped and the script exits. */
let stopping = false;

/** Runs one command; resolves with whether it passed, never rejects. */
function run(command) {
  const started = Date.now();
  const chunks = [];
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      detached: true,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const entry = { child, print };
    running.add(entry);

    function print(result) {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(`\n=== ${command}: ${result}, ${seconds} s ===\n`);
      process.stdout.write(Buffer.concat(chunks));
    }

    // 'close' may not follow 'error' (a spawn that never started), so either one finishes.
    let finished = false;
    function finish(passed, result) {
      // Once stopping, the signal handler has printed the block and sets the exit code.
      if (finished || stopping) return;
      finished = true;
      running.delete(entry);
      print(result);
      resolve({ command, passed });
    }

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => {
      chunks.push(Buffer.from(`${error.message}\n`));
      finish(false, `failed (${error.code ?? 'spawn error'})`);
    });
    child.on('close', (code, signal) => {
      finish(code === 0, code === 0 ? 'passed' : `failed (${signal ?? `exit ${code}`})`);
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    // A second Ctrl+C while the blocks are written out changes nothing.
    if (stopping) return;
    stopping = true;
    for (const { child, print } of running) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // Nothing to stop: the group has ended (ESRCH; EPERM on macOS when only zombies are left)
        // or never started (no pid).
      }
      print(`interrupted (${signal})`);
    }
    // A pipe on macOS is written asynchronously: exit once the blocks are out.
    process.exitCode = 128 + os.constants.signals[signal];
    process.stdout.write('', () => process.exit());
  });
}

const results = await Promise.all(commands.map(run));
const failed = results.filter((r) => !r.passed).map((r) => r.command);
if (failed.length > 0) {
  console.error(`\nrun-parallel: failed: ${failed.join('; ')}`);
  process.exitCode = 1;
}
