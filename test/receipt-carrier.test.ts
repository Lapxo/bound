import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonical } from '@lapxo/topos/wire';
import { carriedFrom, carriedIn, keepCarried, receiptsOf } from '../src/fold/resolved.ts';
import { closeReceipts, fileRegionDigest, meets, receiptPlaces } from '../src/fold/closed.ts';

const line = canonical({scope:'write/place/receipts.bound', role:'writes', form:'alphabet', measure:'digest', value:'sha256:'+'a'.repeat(64), by:'bound', at:'place:receipt'});
const rootLine = (digest: string) => canonical({scope:'receipts', role:'writes', form:'alphabet', measure:'digest', value:digest, by:'bound', at:`place:${digest}`});
const pathOf = (store: string, digest: string) => join(store, 'cas', 'carried', digest.slice('sha256:'.length));

function fixture(run: (root: string, store: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'bound-receipt-carrier-'));
  try { run(root, join(root, '.bound')); } finally { rmSync(root, {recursive:true, force:true}); }
}

test('a native carrier resolves its named child only while its exact bytes authenticate', () => fixture((root, store) => {
  const digest = keepCarried(store, [line]);
  const shipped = [rootLine(digest)];
  writeFileSync(join(root, 'receipts.bound'), shipped.join('\n')+'\n');
  assert.deepEqual(carriedFrom(store, shipped), [line]);
  assert.deepEqual(receiptPlaces(root, store), ['place']);
  assert.equal(carriedIn(store).length, 1);
  const replacement = `${line}\n\n`;
  const actual = createHash('sha256').update(replacement).digest('hex');
  writeFileSync(pathOf(store, digest), replacement);
  const refused = (error: unknown) => error instanceof Error && error.message.includes(`expected ${digest}`) && error.message.includes(`got sha256:${actual}`);
  assert.throws(() => carriedFrom(store, shipped), refused);
  assert.throws(() => receiptPlaces(root, store), refused);
  assert.throws(() => carriedIn(store), refused);
  assert.throws(() => keepCarried(store, [line]), refused);
}));

test('missing named bytes remain missing instead of becoming the root summary', () => fixture((_root, store) => {
  assert.equal(carriedFrom(store, [rootLine('sha256:'+'b'.repeat(64))]), undefined);
  assert.deepEqual(carriedIn(store), []);
}));

test('delivery into another store preserves bytes and refuses a corrupt source', () => fixture((root, source) => {
  const digest = keepCarried(source, [line]);
  const destination = join(root, 'destination');
  assert.equal(keepCarried(destination, [line], source), digest);
  assert.deepEqual(readFileSync(pathOf(destination, digest)), readFileSync(pathOf(source, digest)));
  assert.deepEqual(carriedFrom(destination, [rootLine(digest)]), [line]);
  rmSync(pathOf(source, digest));
  mkdirSync(join(source, 'cas', 'carried'), {recursive:true});
  writeFileSync(pathOf(source, digest), 'substituted receipt bytes');
  const other = join(root, 'other');
  assert.throws(() => keepCarried(other, [line], source), /REFUSE·receipt carried bytes mismatch/);
  assert.equal(carriedFrom(other, [rootLine(digest)]), undefined);
}));


test('root closure compares each child receipt to its named digest, not merely a readable file', () => {
  for (const substituted of [false, true]) fixture((root, store) => {
    const body = rootLine('sha256:'+'c'.repeat(64))+'\n';
    const expected = 'sha256:'+createHash('sha256').update(body).digest('hex');
    const named = canonical({scope:'write/child/receipts.bound', role:'writes', form:'alphabet', measure:'digest', value:expected, by:'bound', at:`place:${expected}`});
    const carrier = keepCarried(store, [named]);
    writeFileSync(join(root, 'receipts.bound'), rootLine(carrier)+'\n');
    mkdirSync(join(root, 'child'));
    writeFileSync(join(root, 'child', 'receipts.bound'), substituted ? body+'\n' : body);
    assert.equal(meets(root, store, ''), !substituted);
    if (!substituted) {
      writeFileSync(join(root, 'child', 'receipts.bound'), body+'\n');
      assert.equal(meets(root, store, ''), false, 'a cached root verdict must not bypass the named bytes');
    }
  });
});


test('native receipts retain ordinary input-linked readings and ignore unobserved or unrelated deliveries', () => fixture((root,store) => {
  const at='place:sha256:'+createHash('sha256').update('actual input').digest('hex');
  const input=canonical({scope:'src/input',role:'writes',form:'alphabet',measure:'observed',value:'actual input',by:'reader',at});
  const reading=canonical({scope:'measurement/extent',role:'writes',form:'interval',measure:'lines',value:'7..7',by:'reader',at});
  const other=canonical({scope:'measurement/foreign',role:'writes',form:'interval',measure:'lines',value:'0..0',by:'another-reader',at});
  const stale=canonical({scope:'measurement/old',role:'writes',form:'interval',measure:'lines',value:'99..99',by:'reader',at:'place:old'});
  keepCarried(store,[stale]);
  const fold={root,store,standing:[],observed:[input,reading,reading,other,stale],paid:[]} as unknown as import('../src/cli/place.ts').PlaceFold;
  const native=receiptsOf(fold);
  assert.equal(native.filter(line=>line===reading).length,1);
  assert.equal(native.includes(other),false);
  assert.equal(native.includes(stale),false);
  assert.ok(native.some(line=>line.includes('scope=src/input')));
}));


test('a standalone root closes its own native receipt and preserves closure without private history', async () => {
  const root=mkdtempSync(join(tmpdir(),'bound-root-receipt-'));
  const clone=mkdtempSync(join(tmpdir(),'bound-root-clone-'));
  try {
    const store=join(root,'.bound');
    const target=canonical({scope:'name',role:'writes',form:'alphabet',measure:'id',value:'independent-place',by:'target',at:'policy:name'})+'\n';
    writeFileSync(join(root,'TARGET.bound'),target);
    mkdirSync(join(root,'src'));
    writeFileSync(join(root,'src','input.txt'),'actual measured input\n');
    const observation=canonical({scope:'src/input',role:'writes',form:'interval',measure:'lines',value:'1..1',by:'reader',at:'place:input'});
    const carrier=keepCarried(store,[observation]);
    const count=canonical({scope:'receipts/src',role:'writes',form:'interval',measure:'count',value:'1..1',by:'bound',at:`place:${carrier}`});
    writeFileSync(join(root,'receipts.bound'),rootLine(carrier)+'\n'+count+'\n');
    mkdirSync(join(store,'ledger'));
    writeFileSync(join(store,'ledger','source.bound'),target);
    assert.equal(meets(root,store,''),false,'observations without a byte receipt are still open');
    assert.deepEqual(await closeReceipts(root,store),[],'no byte receipt is manufactured from a count alone');
    // An open native byte receipt is refreshed by the existing close path after its observations exist.
    const open=canonical({scope:'receipts/src',role:'writes',form:'alphabet',measure:'bytes',value:'sha256:'+'0'.repeat(64),by:'bound',at:'place:open'});
    writeFileSync(join(root,'receipts.bound'),rootLine(carrier)+'\n'+count+'\n'+open+'\n');
    assert.deepEqual(await closeReceipts(root,store),['']);
    assert.equal(meets(root,store,''),true);
    assert.deepEqual(receiptPlaces(root,store),['']);
    writeFileSync(join(clone,'TARGET.bound'),target);
    mkdirSync(join(clone,'src'));
    writeFileSync(join(clone,'src','input.txt'),readFileSync(join(root,'src','input.txt')));
    writeFileSync(join(clone,'receipts.bound'),readFileSync(join(root,'receipts.bound')));
    assert.equal(keepCarried(join(clone,'.bound'),[observation],store),carrier);
    assert.equal(meets(clone,join(clone,'.bound'),''),true,'a clone needs evidence bytes, not private ledger history');
    writeFileSync(join(clone,'src','input.txt'),'changed source\n');
    assert.equal(meets(clone,join(clone,'.bound'),''),false,'root closure rechecks current bytes');
    writeFileSync(join(clone,'src','input.txt'),readFileSync(join(root,'src','input.txt')));
    rmSync(pathOf(join(clone,'.bound'),carrier));
    assert.equal(meets(clone,join(clone,'.bound'),''),false,'missing observation bytes cannot be replaced by summaries');
  } finally {rmSync(root,{recursive:true,force:true});rmSync(clone,{recursive:true,force:true});}
});


test('unchanged child receipt bytes cannot hide a changed child input in the same process', () => fixture((root,store) => {
  writeFileSync(join(root,'TARGET.bound'),canonical({scope:'wire/families',role:'writes',form:'alphabet',measure:'id',value:'reader|tree|write|leaf|view',by:'target',at:'policy:wire'})+'\n');
  const child=join(root,'child');mkdirSync(join(child,'src'),{recursive:true});
  writeFileSync(join(child,'TARGET.bound'),'');writeFileSync(join(child,'src','input.txt'),'before\n');
  const digest=fileRegionDigest(root,'child/','receipts/src','sha256');
  const body=canonical({scope:'receipts/src',role:'writes',form:'alphabet',measure:'bytes',value:digest,at:`place:${digest}`,by:'bound'})+'\n';
  writeFileSync(join(child,'receipts.bound'),body);
  const namedDigest='sha256:'+createHash('sha256').update(body).digest('hex');
  const named=canonical({scope:'write/child/receipts.bound',role:'writes',form:'alphabet',measure:'digest',value:namedDigest,at:`place:${namedDigest}`,by:'bound'});
  const carrier=keepCarried(store,[named]);writeFileSync(join(root,'receipts.bound'),rootLine(carrier)+'\n');
  assert.equal(meets(root,store,''),true);
  writeFileSync(join(child,'src','input.txt'),'after\n');
  assert.equal(meets(root,store,''),false,'a receipt and unchanged TARGET do not authorize a stale input-cache verdict');
}));
