import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = fileURLToPath(new URL('./', import.meta.url));
const output = process.argv[2];
if (!output) throw Error('Usage: check_worker_package.mjs <evidence-directory>');
const destination = resolve(output);
mkdirSync(destination, {recursive: true});
const scratch = mkdtempSync(join(tmpdir(), 'bound-worker-package-'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

try {
  const [packed] = JSON.parse(execFileSync('npm', [
    'pack', '--offline', '--ignore-scripts', '--json', '--cache', join(scratch, 'cache'),
    '--pack-destination', destination,
  ], {cwd: root, encoding: 'utf8'}));
  const archive = join(destination, packed.filename);
  assert(!packed.files.some(file => file.path.startsWith('experiments/')));
  const manifest = readFileSync(join(root, 'package.json'));
  assert.equal(packed.version, JSON.parse(manifest).version);

  const consumer = join(scratch, 'consumer');
  const installed = join(consumer, 'node_modules/@lapxo/bound');
  mkdirSync(installed, {recursive: true});
  execFileSync('tar', ['-xzf', archive, '--strip-components', '1', '-C', installed]);
  assert.deepEqual(readFileSync(join(installed, 'package.json')), manifest);

  const copy = (source, name) => copyFileSync(source, join(consumer, name));
  copy(join(fixtures, 'worker_api_local_consumer.mjs'), 'consumer.mjs');
  copy(join(fixtures, 'capsule_worker_embedding.mjs'), 'worker.mjs');
  copy(join(fixtures, 'worker_api_public_types.mts'), 'types.mts');
  copy(join(fixtures, 'fixtures/persistence.wasm'), 'persistence.wasm');
  for (const [source, name] of [
    ['manifest.json', 'manifest.json'], ['guest.js', 'guest.js'],
    ['runtime.js', 'quickjs-runtime.js'], ['runtime.wasm', 'quickjs.wasm'],
  ]) copy(join(installed, 'assets/wasm', source), name);
  writeFileSync(join(consumer, 'render.mjs'), "let n=0;export const render=()=>[String(++n)];\n");
  await build({
    stdin: {contents: "export {respond} from '@lapxo/topos/contract';", resolveDir: root},
    outfile: join(consumer, 'contract.mjs'), bundle: true, platform: 'neutral', format: 'esm',
  });

  const inventory = readdirSync(consumer, {recursive: true, withFileTypes: true})
    .filter(entry => entry.isFile())
    .map(entry => {
      const path = join(entry.parentPath, entry.name);
      const bytes = readFileSync(path);
      return {path: relative(consumer, path), bytes: bytes.length, sha256: digest(bytes)};
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(join(consumer, 'inventory.json'), JSON.stringify({files: inventory}));
  execFileSync(process.execPath, ['consumer.mjs', join(destination, 'consumer.json')], {
    cwd: consumer, stdio: 'inherit',
  });
  execFileSync(process.execPath, [
    join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'nodenext',
    '--moduleResolution', 'nodenext', '--target', 'es2022', '--skipLibCheck', 'types.mts',
  ], {cwd: consumer, stdio: 'inherit'});
  writeFileSync(join(destination, 'package-check.json'), JSON.stringify({
    profile: 'bound-worker-portable-package-check@1', node: process.version,
    archive: packed.filename, sha256: digest(readFileSync(archive)),
    types: 'passed', sealedReleaseArchive: false,
  }, null, 2) + '\n');
} finally {
  rmSync(scratch, {recursive: true, force: true});
}
