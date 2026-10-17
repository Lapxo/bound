import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import { moduleImportSyntax } from '../src/host/native/module-syntax.ts';

const syntax = (source: string) => moduleImportSyntax(source, 'dist/example.js');
test('imported algebra name aliased away is not loader reference', () => {
 assert.deepEqual(syntax("import { require as requireFloor } from 'algebra'; requireFloor(1);"), { imports: ['algebra'], unresolved: [] });
});
test('reexport from a named module has no local loader reference', () => {
 assert.deepEqual(syntax("export { require } from 'algebra';"), { imports: ['algebra'], unresolved: [] });
});
test('function declaration name is not a loader reference', () => {
 assert.deepEqual(syntax('export function require(L, world) { return world; }'), { imports: [], unresolved: [] });
});
test('global literal require remains a captured dependency', () => {
 assert.deepEqual(syntax("require('dependency');"), { imports: ['dependency'], unresolved: [] });
});
test('global require escaped through alias remains unresolved', () => {
 assert.ok(syntax("const load = require; load('dependency');").unresolved.length);
});
test('global require computed property remains unresolved', () => {
 assert.ok(syntax("require[choice]('dependency');").unresolved.length);
});
test('computed require call remains unresolved', () => {
 assert.ok(syntax('require(choice);').unresolved.length);
});
test('source-less export still exposes global require', () => {
 assert.throws(() => syntax('export { require };'), /REFUSE·source module syntax/);
 assert.ok(syntax('const require = globalThis.loader; export { require };').unresolved.length);
});
test('local function calls are not assumed non-loader without scope analysis', () => {
 assert.ok(syntax('function require(x) { return x; } require(choice);').unresolved.length);
 assert.deepEqual(syntax("function require(x) { return x; } require('still-inventoried');").imports, ['still-inventoried']);
});
test('dynamic import inside a function named require is still unresolved', () => {
 assert.ok(syntax('export function require(x) { return import(x); }').unresolved.length);
});
test('the three reached algebra name sites parse without unresolved', async () => {
 const pkg=dirname(createRequire(import.meta.url).resolve('@lapxo/obligations/package.json'));
 for (const coordinate of [new URL('../dist/engine/object.js',import.meta.url),join(pkg,'dist/field/require.js'),join(pkg,'dist/views/field.js')]) {
  const result=moduleImportSyntax(await readFile(coordinate,'utf8'),String(coordinate));
  assert.deepEqual(result.unresolved, []);
 }
});
