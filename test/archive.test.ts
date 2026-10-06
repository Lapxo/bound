import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { canonical } from '@lapxo/topos/wire';
import { members, unpack } from '../src/host/archive.ts';
import { layReleases, laidAt, resolvedOf, runtimeTreeAt } from '../src/host/release.ts';
import { blobAt } from '../src/land/ledger.ts';

const record = (name: string, text: string, type = '0'): Buffer => {
  const body = Buffer.from(text);
  const h = Buffer.alloc(512);
  h.write(name, 0, 100); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136); h.fill(32, 148, 156); h.write(type, 156); h.write('ustar\0', 257);
  h.write(h.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([h, body, Buffer.alloc(Math.ceil(body.length / 512) * 512 - body.length)]);
};
const tar = (...rows: Buffer[]): Buffer => gzipSync(Buffer.concat([...rows, Buffer.alloc(1024)]));
const sha = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const save = (store: string, digest: string, bytes: Uint8Array): void => { const at = blobAt(store, digest); mkdirSync(join(store, 'cas', 'blobs'), { recursive: true }); writeFileSync(at, bytes); };
const scope = (digest: string): string => canonical({ scope: 'dep/example', role: 'reads', form: 'alphabet', measure: 'digest', value: digest, needs: 'layout', by: 'fixture', at: 'policy:fixture' });

for (const [label, bytes] of [
  ['checksum', (() => { const r = record('a', 'x'); r[0] = 98; return tar(r); })()],
  ['truncated payload', gzipSync(record('a', 'x').subarray(0, 513))],
  ['traversal', tar(record('../escape', 'x'))],
  ['absolute path', tar(record('/escape', 'x'))],
  ['symlink', tar(record('link', '', '2'))],
  ['hardlink', tar(record('link', '', '1'))],
  ['duplicate', tar(record('./a', 'x'), record('a', 'y'))],
  ['file ancestor', tar(record('a', 'x'), record('a/b', 'y'))],
  ['reverse ancestor', tar(record('a/b', 'x'), record('a', 'y'))],
] as const) test(`archive rejects ${label} before writing any member`, () => {
  const root = mkdtempSync(join(tmpdir(), 'archive-refuse-'));
  try { assert.throws(() => unpack(bytes, root), /REFUSE·archive/); assert.deepEqual(readdirSync(root), []); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test('archive retains any regular member including a domain path named cas/blobs', () => {
  const rows = members(tar(record('cas/blobs/evidence', 'domain'), record('other/file', 'bytes')));
  assert.deepEqual(rows.map((row) => row.name), ['cas/blobs/evidence', 'other/file']);
});

test('PAX paths are parsed by byte length without a consumer prefix', () => {
  const path = 'á'.repeat(70) + '/evidence';
  const content = `path=${path}\n`;
  let n = Buffer.byteLength(content) + 2;
  while (Buffer.byteLength(`${n} ${content}`) !== n) n = Buffer.byteLength(`${n} ${content}`);
  const rows = members(tar(record('attributes', `${n} ${content}`, 'x'), record('short', 'held')));
  assert.equal(rows[0]?.name, path); assert.equal(Buffer.from(rows[0]!.bytes).toString(), 'held');
});

test('an existing destination symlink cannot receive an extracted member', () => {
  const root = mkdtempSync(join(tmpdir(), 'archive-link-'));
  try {
    const into = join(root, 'into'); const outside = join(root, 'outside'); mkdirSync(into); mkdirSync(outside);
    symlinkSync(outside, join(into, 'link'));
    assert.throws(() => unpack(tar(record('ok', 'first'), record('link/escape', 'bad')), into), /REFUSE·archive/);
    assert.equal(existsSync(join(into, 'ok')), false); assert.deepEqual(readdirSync(outside), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a valid release retains every archive member and resolves only after complete layout', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-complete-')); const store = join(root, 'store'); const own = join(root, 'own');
  try {
    const bytes = tar(record('cas/blobs/evidence', 'domain'), record('file', 'held')); const digest = sha(bytes); save(own, digest, bytes);
    assert.equal(layReleases(store, own, [scope(digest)]), 1);
    assert.equal(readFileSync(join(own, 'layout', 'cas/blobs/evidence'), 'utf8'), 'domain');
    assert.equal(readFileSync(join(own, 'layout', 'file'), 'utf8'), 'held');
    assert.equal(resolvedOf(store, own, [scope(digest)]).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a missing snapshot member rejects layout and leaves the existing place intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-missing-')); const store = join(root, 'store'); const own = join(root, 'own');
  try {
    const digest = sha(Buffer.from('release')); const missing = sha(Buffer.from('missing'));
    const at = laidAt(store, digest); mkdirSync(join(store, 'cas', 'laid'), { recursive: true });
    writeFileSync(at, canonical({ scope: 'file/evidence', role: 'writes', form: 'alphabet', measure: 'digest', value: missing, at: `place:${missing}`, by: 'fixture' }) + '\n');
    mkdirSync(join(own, 'layout'), { recursive: true }); writeFileSync(join(own, 'layout', 'prior'), 'intact');
    assert.throws(() => layReleases(store, own, [scope(digest)]), /REFUSE·release missing blob/);
    assert.equal(readFileSync(join(own, 'layout', 'prior'), 'utf8'), 'intact');
    assert.equal(existsSync(join(own, 'layout', '.laid')), false);
    assert.equal(existsSync(join(own, `layout.${process.pid}`)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a corrupt release blob does not continue with later releases', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-corrupt-')); const store = join(root, 'store'); const own = join(root, 'own');
  try { const digest = sha(Buffer.from('actual')); save(own, digest, Buffer.from('corrupt')); assert.throws(() => layReleases(store, own, [scope(digest)]), /REFUSE·release/); assert.equal(existsSync(join(own, 'layout')), false); }
  finally { rmSync(root, { recursive: true, force: true }); }
});


test('a marker alone cannot certify a layout whose member changed', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-changed-')); const store = join(root, 'store'); const own = join(root, 'own');
  try {
    const bytes = tar(record('file','held')); const digest = sha(bytes); save(own,digest,bytes);
    layReleases(store,own,[scope(digest)]);
    // The CAS is immutable; remove the layout link before simulating a consumer edit.
    rmSync(join(own,'layout','file')); writeFileSync(join(own,'layout','file'),'changed');
    assert.equal(resolvedOf(store,own,[scope(digest)]).length,0);
    assert.equal(layReleases(store,own,[scope(digest)]),1);
    assert.equal(readFileSync(join(own,'layout','file'),'utf8'),'held');
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('a historical snapshot that omitted a regular member requires an explicit rebuild', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-incomplete-')); const store = join(root, 'store'); const own = join(root, 'own');
  try {
    const bytes = tar(record('file','held')); const digest = sha(bytes); save(own,digest,bytes);
    mkdirSync(join(store,'cas','laid'),{recursive:true}); writeFileSync(laidAt(store,digest),'');
    assert.throws(()=>layReleases(store,own,[scope(digest)]),/snapshot.*omits or changes/);
    assert.equal(existsSync(join(own,'layout')),false);
  } finally { rmSync(root,{recursive:true,force:true}); }
});


test('runtime trees use verified archives without confusing snapshot metadata with executable directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'runtime-tree-'));
  try {
    const store = join(root, 'store'); const own = join(root, 'own');
    const bytes = tar(record('package.json', '{"type":"module"}'), record('dist/index.js', 'export const identity = 1;'));
    const digest = sha(bytes); save(own, digest, bytes);
    mkdirSync(join(store,'cas','laid'),{recursive:true});
    writeFileSync(laidAt(store,digest),'historical snapshot metadata');
    const runtime = runtimeTreeAt(store,own,digest)!;
    assert.equal(readFileSync(join(runtime,'dist/index.js'),'utf8'),'export const identity = 1;');
    assert.equal(readFileSync(laidAt(store,digest),'utf8'),'historical snapshot metadata');
    writeFileSync(join(runtime,'dist/index.js'),'tampered runtime');
    assert.equal(runtimeTreeAt(store,own,digest),runtime);
    assert.equal(readFileSync(join(runtime,'dist/index.js'),'utf8'),'export const identity = 1;');
    assert.equal(runtimeTreeAt(store,own,'sha256:'+'a'.repeat(64)),undefined);
    assert.throws(()=>runtimeTreeAt(store,own,'sha256:../../escape'),/invalid digest/);
    save(own,digest,tar(record('other','wrong bytes')));
    assert.throws(()=>runtimeTreeAt(store,own,digest),/does not name its available bytes/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
