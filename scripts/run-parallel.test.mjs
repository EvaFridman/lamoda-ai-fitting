// Cases for scripts/run-parallel.mjs; run by `npm test` with `node --test`.

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = path.join(import.meta.dirname, 'run-parallel.mjs');
const NODE = JSON.stringify(process.execPath);

/** A shell command that runs a line of JavaScript in Node. */
const js = (code) => `${NODE} -e ${JSON.stringify(code)}`;

/**
 * Whether a process is still running. A stopped command whose parent is gone waits as a zombie
 * until PID 1 reaps it, and a container's PID 1 may never do so: a zombie counts as stopped.
 */
function isRunning(pid) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
  if (process.platform !== 'linux') return true;
  let stat;
  try {
    stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  return stat.slice(stat.lastIndexOf(')') + 2)[0] !== 'Z';
}

/** Waits until a process has stopped, failing after 5 s. */
async function waitForStop(pid, what) {
  for (let waited = 0; isRunning(pid); waited += 50) {
    assert.ok(waited < 5000, `${what} is still running`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Waits until a file exists, failing after 10 s. */
async function waitForFile(file, what) {
  for (let waited = 0; !fs.existsSync(file); waited += 50) {
    assert.ok(waited < 10000, `${what} did not start`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function runParallel(...commands) {
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  return spawnSync(process.execPath, [SCRIPT, ...commands], { encoding: 'utf8', env });
}

describe('run-parallel', () => {
  it('exits 0 and prints each command under its header when all pass', () => {
    const a = js('console.log("out of a")');
    const b = js('console.error("err of b")');
    const { status, stdout } = runParallel(a, b);
    assert.equal(status, 0);
    assert.match(stdout, new RegExp(`=== ${escape(a)}: passed, [\\d.]+ s ===\\nout of a\\n`));
    assert.match(stdout, new RegExp(`=== ${escape(b)}: passed, [\\d.]+ s ===\\nerr of b\\n`));
  });

  it('exits 1 and names the failed command, still printing the others', () => {
    const ok = js('console.log("fine")');
    const bad = js('console.log("FAIL some.test.ts > breaks"); process.exit(3)');
    const { status, stdout, stderr } = runParallel(ok, bad);
    assert.equal(status, 1);
    assert.match(stdout, /: passed, [\d.]+ s ===\nfine\n/);
    assert.match(stdout, /: failed \(exit 3\), [\d.]+ s ===\nFAIL some\.test\.ts > breaks\n/);
    assert.equal(stderr.trim(), `run-parallel: failed: ${bad}`);
  });

  it('names every failed command', () => {
    const one = js('process.exit(1)');
    const two = js('process.exit(2)');
    const { status, stderr } = runParallel(one, two);
    assert.equal(status, 1);
    assert.match(stderr, new RegExp(`failed: .*${escape(one)}`));
    assert.match(stderr, new RegExp(`failed: .*${escape(two)}`));
  });

  it('counts a command killed by a signal as failed', () => {
    const killed = js('process.kill(process.pid, "SIGKILL")');
    const { status, stdout } = runParallel(killed);
    assert.equal(status, 1);
    assert.match(stdout, /: failed \((SIGKILL|exit 137)\)/);
  });

  it('prints blocks in the order the commands end, each in one piece', () => {
    // The slow command writes first and ends last; its lines stay in one block after the fast one's.
    const slow = js('console.log("slow 1"); setTimeout(() => console.log("slow 2"), 1000);');
    const fast = js('setTimeout(() => console.log("fast"), 100);');
    const { status, stdout } = runParallel(slow, fast);
    assert.equal(status, 0);
    const fastAt = stdout.indexOf('fast\n');
    const slowAt = stdout.indexOf('slow 1\nslow 2\n');
    assert.ok(fastAt !== -1 && slowAt !== -1, stdout);
    assert.ok(fastAt < slowAt, stdout);
  });

  it('runs the commands at the same time', () => {
    // One after the other they would take at least 2 s; together, about 1 s plus Node's start.
    const wait = js('setTimeout(() => {}, 1000);');
    const started = Date.now();
    const { status } = runParallel(wait, wait);
    const elapsed = Date.now() - started;
    assert.equal(status, 0);
    assert.ok(elapsed < 2000, `took ${elapsed} ms`);
  });

  it('on SIGTERM stops the commands, prints their output so far and exits 143', async () => {
    // run-parallel holds the command's output back, so the command reports its start in a file.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-parallel-'));
    const pidFile = path.join(dir, 'pid');
    const command = js(
      `console.log("pid", process.pid); require("fs").writeFileSync(${JSON.stringify(pidFile)}, "");` +
        ' setTimeout(() => {}, 30000);',
    );
    const child = spawn(process.execPath, [SCRIPT, command], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    await waitForFile(pidFile, 'the command');
    fs.rmSync(dir, { recursive: true });
    child.kill('SIGTERM');
    const [code] = await once(child, 'close');
    assert.equal(code, 143);
    assert.match(stdout, /: interrupted \(SIGTERM\), [\d.]+ s ===\npid \d+\n/);
    await waitForStop(Number(/pid (\d+)/.exec(stdout)[1]), 'the command');
  });

  it('on SIGTERM also stops the processes a command started (as `npm run` starts its script)', async () => {
    // The command starts a second Node that writes its pid to a file (renamed into place, so it is
    // never read half-written); the first one does not pass signals on, as a shell that forks does
    // not.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-parallel-'));
    const pidFile = path.join(dir, 'pid');
    const grandchild =
      `const fs = require("fs"); fs.writeFileSync(${JSON.stringify(`${pidFile}.tmp`)}, String(process.pid));` +
      ` fs.renameSync(${JSON.stringify(`${pidFile}.tmp`)}, ${JSON.stringify(pidFile)}); setTimeout(() => {}, 30000);`;
    const command = js(
      `require("child_process").spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], { stdio: "inherit" });`,
    );
    const child = spawn(process.execPath, [SCRIPT, command], { stdio: 'ignore' });
    await waitForFile(pidFile, 'the second process');
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    fs.rmSync(dir, { recursive: true });
    child.kill('SIGTERM');
    const [code] = await once(child, 'close');
    assert.equal(code, 143);
    await waitForStop(pid, 'the process the command started');
  });

  it('exits 1 with usage when given no commands', () => {
    const { status, stdout, stderr } = runParallel();
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /^Usage: /);
  });
});

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
