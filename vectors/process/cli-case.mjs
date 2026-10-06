import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const reader = resolve(process.argv[2]);
const mode = process.argv[3];
const root = mkdtempSync(join(tmpdir(), 'cli-vector-'));
try {
  let args;
  if (mode === 'file') {
    const input = join(root, 'saying.bound');
    writeFileSync(input, 'bound-lock/1 at=policy:fixture by=target form=alphabet measure=id role=writes scope=fixture value=present\n');
    args = ['fold', input];
  } else if (mode === 'check') args = ['fold', '--check'];
  else if (mode === 'usage') args = ['unsupported-verb'];
  else throw new Error('Undeclared CLI case');
  const result = spawnSync(process.execPath, [reader, ...args], { cwd: root, encoding: 'utf8', timeout: 15000 });
  if (result.error || result.signal || result.status === null) throw result.error ?? new Error(result.signal ?? 'No process status');
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.status;
} finally { rmSync(root, { recursive: true, force: true }); }
