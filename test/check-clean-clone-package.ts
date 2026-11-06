import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join, relative, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const input = resolve(process.argv[2] ?? '.pr-package');
const filename = 'lapxo-bound-0.2.9.tgz';
const archive = join(input, filename);
const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
assert.equal(readFileSync(join(input, 'SHA256SUMS'), 'utf8').trim(), `${digest}  ${filename}`);

function members(root: string, directory = root): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isDirectory()) return members(root, path);
    assert(stat.isFile(), 'Expected regular package member ' + path);
    return [relative(root, path)];
  });
}

const scratch = mkdtempSync(join(tmpdir(), 'bound-pr-package-'));
try {
  const extracted = join(scratch, 'extracted');
  const consumer = join(scratch, 'consumer');
  mkdirSync(extracted);
  mkdirSync(consumer);
  execFileSync('tar', ['-xzf', archive, '-C', extracted]);
  writeFileSync(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
  execFileSync('npm', [
    'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--package-lock=false', '--cache', join(scratch, 'npm-cache'), archive,
  ], {cwd: consumer, stdio: 'inherit'});
  const expected = join(extracted, 'package');
  const installed = join(consumer, 'node_modules/@lapxo/bound');
  const files = members(expected).sort();
  assert.deepEqual(members(installed).sort(), files);
  for (const file of files) {
    assert.deepEqual(readFileSync(join(installed, file)), readFileSync(join(expected, file)), file);
  }
  assert(!existsSync(join(installed, '.bound')));
  const require = createRequire(join(consumer, 'package.json'));
  assert.equal(require('@lapxo/bound/package.json').version, '0.2.9');
  const host = await import(pathToFileURL(require.resolve('@lapxo/bound/host')).href);
  const engine = await import(pathToFileURL(require.resolve('@lapxo/bound/engine')).href);
  assert.equal(typeof host.readRootStandingInProcess, 'function');
  assert.equal(typeof engine.objectFold, 'function');
  console.log(JSON.stringify({profile:'bound-clean-pr-package@1', digest, files:files.length, node:process.version}));
} finally {
  rmSync(scratch, {recursive:true, force:true});
}
