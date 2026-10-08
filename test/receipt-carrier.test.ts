import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonical, parse, signedBytes, formatSignature, parseSignature } from '@lapxo/topos/wire';
import { carriedFrom, carriedIn, keepCarried, receiptsOf } from '../src/fold/resolved.ts';
import { closeReceipts, fileRegionDigest, meets, receiptPlaces } from '../src/fold/closed.ts';
import {receiptRegion} from '../src/render/receipts.ts';
import {ownLock} from '../src/observe/runner.ts';
import {fieldOf} from '../src/fold/claims.ts';
import {wireLine} from '../src/fold/wire.ts';

const line = canonical({scope:'write/place/receipts.bound', role:'writes', form:'alphabet', measure:'digest', value:'sha256:'+'a'.repeat(64), by:'bound', at:'place:receipt'});
const rootLine = (digest: string) => canonical({scope:'receipts', role:'writes', form:'alphabet', measure:'digest', value:digest, by:'bound', at:`place:${digest}`});
const pathOf = (store: string, digest: string) => join(store, 'cas', 'carried', digest.slice('sha256:'.length));

function fixture(run: (root: string, store: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'bound-receipt-carrier-'));
  try { run(root, join(root, '.bound')); } finally { rmSync(root, {recursive:true, force:true}); }
}

test('a regenerated native receipt carries observations but replaces its old implementation metadata',()=>fixture((root,store)=>{
 const contract=wireLine(ownLock(),'receipt-instrument');assert.ok(contract);
 const coordinate=fieldOf(contract!,'value');
 const old=canonical({scope:coordinate,role:'writes',form:'alphabet',measure:'digest',value:'sha256:'+'a'.repeat(64),by:'bound',at:'place:old'});
 const observation=canonical({scope:'reading/extent',role:'writes',form:'interval',measure:'bytes',value:'3..3',by:'reader',at:'place:input'});
 const wire=canonical({scope:'wire/receipt-fields',role:'writes',form:'alphabet',measure:'id',value:'scope|role|form|measure|value|by|at',by:'target',at:'policy:receipt'});
 const algorithm=canonical({scope:'wire/digest-algorithms',role:'writes',form:'alphabet',measure:'id',value:'sha256',by:'target',at:'policy:receipt'});
 const families=canonical({scope:'wire/families',role:'writes',form:'alphabet',measure:'id',value:'reader|read|uses|dep|sources|region|view|receipts',by:'target',at:'policy:receipt'});
 const published=canonical({scope:'publish/bootstrap',role:'writes',form:'alphabet',measure:'id',value:'present',by:'target',at:'policy:receipt'});
 const standing=[wire,algorithm,families,published];
 writeFileSync(join(root,'TARGET.bound'),standing.join('\n')+'\n');keepCarried(store,[old,observation]);
 const fold={root,store,standing,epoch:1,observed:[],paid:[]} as unknown as import('../src/cli/place.ts').PlaceFold;
 const emitted=receiptRegion(fold,8);
 assert.equal(emitted.filter(line=>fieldOf(line,'scope')===coordinate).length,1);
 assert.equal(emitted.includes(observation),true);
 assert.equal(emitted.includes(old),false);
 assert.equal(carriedIn(store).some(file=>readFileSync(file,'utf8').includes(old)),true,'the previous authenticated carrier remains history');
}));

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

test('resolution 8 authenticates an inline carrier in an empty store; summaries and changed bodies do not', () => fixture((_root,store) => {
  const digest='sha256:'+createHash('sha256').update(line+'\n').digest('hex');
  assert.deepEqual(carriedFrom(store,[line,rootLine(digest)]),[line]);
  assert.equal(carriedFrom(store,[rootLine(digest)]),undefined);
  assert.throws(()=>carriedFrom(store,[line.replace('place/receipts','other/receipts'),rootLine(digest)]),/REFUSE·receipt public carrier bytes mismatch/);
  assert.deepEqual(carriedIn(store),[],'public verification does not manufacture a private carrier');
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

test('file receipts use place-relative coordinates, while inherited render inputs remain inputs', () => fixture((root) => {
  const child=join(root,'child');
  const published=join(root,'published');
  const wire=canonical({scope:'wire/families',role:'writes',form:'alphabet',measure:'id',value:'reader|tree|write|leaf|view',by:'target',at:'policy:wire'});
  const authority=canonical({scope:'keys/owner',role:'writes',form:'alphabet',measure:'id',value:'public-authority',by:'target',at:'policy:authority'});
  writeFileSync(join(root,'TARGET.bound'),wire+'\n'+authority+'\n');
  for(const at of [child,published]) {
    mkdirSync(join(at,'src'),{recursive:true});
    writeFileSync(join(at,'TARGET.bound'),'');
    writeFileSync(join(at,'src','input.txt'),'same input\n');
  }
  const native=fileRegionDigest(root,'child/','receipts/src','sha256');
  assert.equal(native,fileRegionDigest(published,'','receipts/src','sha256'),'moving a place does not rename its inputs');
  const inherited=canonical({scope:'policy/render',role:'writes',form:'alphabet',measure:'id',value:'selected',needs:'child/src',by:'target',at:'policy:render'});
  writeFileSync(join(root,'TARGET.bound'),wire+'\n'+authority+'\n'+inherited+'\n');
  assert.notEqual(fileRegionDigest(root,'child/','receipts/src','sha256'),native,'a parent render input cannot disappear from verification');
}));

test('declared foreign trees keep consumed inputs without sealing unrelated dependency files', () => fixture((root) => {
  const foreign=canonical({scope:'leaf-role/vendor',role:'writes',form:'alphabet',measure:'role',value:'foreign',by:'target',at:'policy:external'});
  writeFileSync(join(root,'TARGET.bound'),foreign+'\n');
  mkdirSync(join(root,'vendor'),{recursive:true});
  writeFileSync(join(root,'vendor','contract.txt'),'accepted contract\n');
  const input=canonical({scope:'vendor/contract.txt',role:'writes',form:'alphabet',measure:'observed',value:'read',by:'reader',at:'place:input'});
  const first=fileRegionDigest(root,'','receipts/.','sha256',[input]);
  writeFileSync(join(root,'vendor','unused.txt'),'not handed to the reader\n');
  assert.equal(fileRegionDigest(root,'','receipts/.','sha256',[input]),first);
  writeFileSync(join(root,'vendor','contract.txt'),'changed contract\n');
  assert.notEqual(fileRegionDigest(root,'','receipts/.','sha256',[input]),first,'a consumed external input still invalidates the receipt');
  const second=fileRegionDigest(root,'','receipts/.','sha256',[input]);
  writeFileSync(join(root,'new-source.txt'),'new owned input\n');
  assert.notEqual(fileRegionDigest(root,'','receipts/.','sha256',[input]),second,'new owned files remain part of the place');
}));


test('native evidence retains signed messages, including their coordinates, through child projection and transfer', () => fixture((root,store) => {
  for (const under of ['', 'child/']) {
    const observations:string[]=[];
    const keys=new Map<string,ReturnType<typeof generateKeyPairSync>>();
    const at='place:sha256:'+createHash('sha256').update('measured input').digest('hex');
    for (const device of ['device-a','device-b']) {
      const pair=generateKeyPairSync('ed25519');keys.set(device,pair);
      for (const fields of [
        {scope:'child/src/input',role:'writes',form:'alphabet',measure:'observed',value:'complete-input-reference'},
        {scope:'measurement/child/extent',role:'writes',form:'interval',measure:'lines',value:'7..7'},
      ]) {
        const body={...fields,by:device,at,epoch:'3'};
        observations.push(canonical({...body,sig:formatSignature('ed25519:test',sign(null,Buffer.from(signedBytes(body)),pair.privateKey).toString('base64'))}));
      }
    }
    const fold={root,store,under,standing:[],observed:[...observations,...observations],paid:[]} as unknown as import('../src/cli/place.ts').PlaceFold;
    const native=receiptsOf(fold);
    assert.deepEqual(new Set(native),new Set(observations),'projection neither edits signed evidence nor duplicates delivery');
    const authentic=(line:string) => {
      const got=parse(line);assert.equal(got.kind,'fact');
      if(got.kind!=='fact')return false;
      const signature=parseSignature(got.value.fields.sig!);assert.ok(signature);
      return verify(null,Buffer.from(signedBytes(got.value.fields)),keys.get(got.value.fields.by!)!.publicKey,Buffer.from(signature.raw,'base64'));
    };
    assert.ok(native.every(authentic));
    assert.equal(authentic(native[0]!.replace('complete-input-reference','changed-input-reference')),false);
    const digest=keepCarried(store,native);
    const empty=join(root,under?'empty-child':'empty-root');
    // The native inline carrier is portable without a ledger or private key.
    assert.deepEqual(carriedFrom(empty,[...native,rootLine(digest)]),native);
    assert.deepEqual(carriedIn(empty),[]);
  }
}));
