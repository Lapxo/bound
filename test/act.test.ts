import { test } from 'node:test';
import { strictEqual, deepStrictEqual, rejects } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { underTheLock, underTheRegions, holds } from '../src/land/act.ts';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const fixture = (): string => mkdtempSync(join(tmpdir(), 'act-'));
const actModule = new URL('../src/land/act.ts', import.meta.url).href;

function child(store: string, region: string): { entered: Promise<string>; done: Promise<number | null> } {
  const code = `import { underTheRegions } from ${JSON.stringify(actModule)}; await underTheRegions(${JSON.stringify(store)}, [${JSON.stringify(region)}], 'child', () => process.stdout.write('entered'));`;
  const run = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
  let error = '';
  run.stderr.on('data', (bytes: Buffer) => { error += bytes.toString(); });
  const entered = new Promise<string>((resolve) => run.stdout.once('data', (bytes: Buffer) => resolve(bytes.toString())));
  const done = new Promise<number | null>((resolve, reject) => {
    run.once('error', reject);
    run.once('exit', (status) => status === 0 ? resolve(status) : reject(new Error(error)));
  });
  return { entered, done };
}

test('independent async acts serialize and awaited nested acts reenter', async () => {
  const store = fixture();
  try {
    const seen: string[] = [];
    await Promise.all([
      underTheRegions(store, ['x'], 'first', async () => {
        seen.push('first');
        strictEqual(holds(store, 'x'), true);
        await underTheRegions(store, ['x'], 'nested', () => { seen.push('nested'); });
        await delay(100);
        seen.push('released');
      }),
      underTheRegions(store, ['x'], 'second', () => { seen.push('second'); }),
    ]);
    deepStrictEqual(seen, ['first', 'nested', 'released', 'second']);
    strictEqual(holds(store, 'x'), false);
    strictEqual(existsSync(join(store, 'locks', 'x')), false);
  } finally { rmSync(store, { recursive: true, force: true }); }
});

test('shared .act marker does not delegate a lock to an unrelated child', async () => {
  const store = fixture();
  try {
    let started: ReturnType<typeof child> | undefined;
    let entered = false;
    await underTheRegions(store, ['x'], 'parent', async () => {
      mkdirSync(join(store, 'locks'), { recursive: true });
      writeFileSync(join(store, 'locks', '.act'), `${join(store, 'locks', 'x')}\n`);
      started = child(store, 'x');
      void started.entered.then(() => { entered = true; });
      await delay(500);
      strictEqual(entered, false);
    });
    strictEqual(await started!.entered, 'entered');
    strictEqual(await started!.done, 0);
  } finally { rmSync(store, { recursive: true, force: true }); }
});

test('whole-tree acquisition waits for an already entered region', async () => {
  const store = fixture();
  try {
    const seen: string[] = [];
    const first = underTheRegions(store, ['x'], 'region', async () => {
      seen.push('region');
      await delay(300);
      seen.push('release');
    });
    await delay(50);
    const whole = underTheLock(store, 'tree', () => { seen.push('tree'); });
    await Promise.all([first, whole]);
    deepStrictEqual(seen, ['region', 'release', 'tree']);
  } finally { rmSync(store, { recursive: true, force: true }); }
});

test('a thrown act releases only its own locks', async () => {
  const store = fixture();
  try {
    await rejects(underTheRegions(store, ['x'], 'throws', () => { throw new Error('expected'); }), /expected/);
    await underTheRegions(store, ['x'], 'after', () => { strictEqual(holds(store, 'x'), true); });
    strictEqual(existsSync(join(store, 'locks', 'x')), false);
  } finally { rmSync(store, { recursive: true, force: true }); }
});

test('a process holding a legacy stamp is waited for without being terminated', async () => {
  const store = fixture();
  try {
    const run = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    await new Promise<void>((resolve, reject) => { run.once('spawn', resolve); run.once('error', reject); });
    try {
      mkdirSync(join(store, 'locks'), { recursive: true });
      const at = join(store, 'locks', 'x');
      writeFileSync(at, `${run.pid} legacy 2000-01-01T00:00:00Z old-stamp\n`);
      let entered = false;
      const pending = underTheRegions(store, ['x'], 'waiter', () => { entered = true; });
      await delay(500);
      strictEqual(run.exitCode, null);
      strictEqual(entered, false);
      strictEqual(readFileSync(at, 'utf8').includes('old-stamp'), true);
      rmSync(at);
      await pending;
    } finally { run.kill(); }
  } finally { rmSync(store, { recursive: true, force: true }); }
});

test('nested reentry succeeds even when an unrelated act is waiting at the gate', async () => {
  const store = fixture();
  try {
    let waiter: Promise<void> | undefined;
    const seen: string[] = [];
    await underTheRegions(store, ['x'], 'outer', async () => {
      // Make a fresh async context by starting the competitor in a child process.
      const other = child(store, 'x');
      waiter = other.done.then(() => { seen.push('other'); });
      await delay(500);
      await underTheRegions(store, ['x'], 'inner', () => { seen.push('inner'); });
    });
    await waiter;
    deepStrictEqual(seen, ['inner', 'other']);
  } finally { rmSync(store, { recursive: true, force: true }); }
});

test('nested lock upgrades refuse without leaving locks behind', async () => {
  const store = fixture();
  try {
    await underTheRegions(store, ['x'], 'outer', async () => {
      await rejects(underTheLock(store, 'upgrade', () => {}), /cannot upgrade/);
      await rejects(underTheRegions(store, ['y'], 'expansion', () => {}), /declare every region/);
      strictEqual(holds(store, 'x'), true);
    });
    strictEqual(existsSync(join(store, 'locks', 'x')), false);
  } finally { rmSync(store, { recursive: true, force: true }); }
});

test('release preserves a lock replaced by another ownership token', async () => {
  const store = fixture();
  try {
    const at = join(store, 'locks', 'x');
    await underTheRegions(store, ['x'], 'original', () => {
      writeFileSync(at, `${process.pid} replacement 2000-01-01T00:00:00Z replacement-token\n`);
    });
    strictEqual(readFileSync(at, 'utf8').includes('replacement-token'), true);
  } finally { rmSync(store, { recursive: true, force: true }); }
});

test('overlapping hierarchical regions serialize while sibling regions may run together', async () => {
  const store = fixture();
  try {
    let overlapping: ReturnType<typeof child> | undefined;
    let entered = false;
    await underTheRegions(store, ['a'], 'ancestor', async () => {
      overlapping = child(store, 'a/b');
      void overlapping.entered.then(() => { entered = true; });
      await delay(500);
      strictEqual(entered, false);
    });
    await overlapping!.done;
    let sibling: ReturnType<typeof child> | undefined;
    await underTheRegions(store, ['a/b'], 'sibling-left', async () => {
      sibling = child(store, 'a/c');
      strictEqual(await sibling.entered, 'entered');
      await sibling.done;
    });
    let ancestor: ReturnType<typeof child> | undefined;
    entered = false;
    await underTheRegions(store, ['a/b'], 'descendant', async () => {
      ancestor = child(store, 'a');
      void ancestor.entered.then(() => { entered = true; });
      await delay(500);
      strictEqual(entered, false);
    });
    await ancestor!.done;
  } finally { rmSync(store, { recursive: true, force: true }); }
});

for (const region of ['.hidden', '.act', '_root', 'percent%2Fname', 'percent%name']) {
  test(`hierarchical overlap is enforced for the literal coordinate ${region}`, async () => {
    const store = fixture();
    try {
      let other: ReturnType<typeof child> | undefined;
      let entered = false;
      await underTheRegions(store, [region], 'parent', async () => {
        other = child(store, `${region}/child`);
        void other.entered.then(() => { entered = true; });
        await delay(500);
        strictEqual(entered, false);
      });
      await other!.done;
    } finally { rmSync(store, { recursive: true, force: true }); }
  });
}

test('a literal _root place remains disjoint from another named place', async () => {
  const store = fixture();
  try {
    await underTheRegions(store, ['_root'], 'literal-root-name', async () => {
      const other = child(store, 'elsewhere');
      strictEqual(await other.entered, 'entered');
      await other.done;
    });
  } finally { rmSync(store, { recursive: true, force: true }); }
});

test('trailing separators share one region while ambiguous dot and doubled separators refuse', async () => {
  const store = fixture();
  try {
    let other: ReturnType<typeof child> | undefined;
    let entered = false;
    await underTheRegions(store, ['a///'], 'canonical', async () => {
      other = child(store, 'a/child');
      void other.entered.then(() => { entered = true; });
      await delay(500);
      strictEqual(entered, false);
    });
    await other!.done;
    for (const region of ['.', '..', 'a/./b', 'a/../b', 'a//b', '/absolute']) {
      await rejects(underTheRegions(store, [region], 'invalid', () => {}), /invalid region coordinate/);
    }
  } finally { rmSync(store, { recursive: true, force: true }); }
});

test('a legacy hidden lock also blocks a new descendant lock', async () => {
  const store = fixture();
  try {
    mkdirSync(join(store, 'locks'), { recursive: true });
    const legacy = join(store, 'locks', '.hidden');
    writeFileSync(legacy, `${process.pid} legacy 2000-01-01T00:00:00Z legacy-token\n`);
    let entered = false;
    const other = child(store, '.hidden/child');
    void other.entered.then(() => { entered = true; });
    await delay(500);
    strictEqual(entered, false);
    rmSync(legacy);
    await other.done;
  } finally { rmSync(store, { recursive: true, force: true }); }
});
