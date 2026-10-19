import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHash,sign} from 'node:crypto';
import {canonical,formatSignature} from '@lapxo/topos/wire';
import {landRootLotInProcess,recoverRootActInProcess,rootLotSnapshot,nativeHostInstrument} from '@lapxo/bound/host';
import {actingRootFixture} from './support/acting-root.ts';
const sha256=(bytes:Uint8Array|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const yes=JSON.parse(readFileSync(new URL('../samples/native-host/yes.json',import.meta.url),'utf8'));
const no=JSON.parse(readFileSync(new URL('../samples/native-host/no.json',import.meta.url),'utf8'));

for(const place of yes.places)test(`public compiled host consumer: ${place.name}`,{timeout:15000},async()=>{
 const {name}=place,packageRoot=dirname(fileURLToPath(import.meta.resolve('@lapxo/bound/package.json'))),entry=join(packageRoot,'dist','cli','verb.js');
 const f=actingRootFixture(name,[],{entry});
 try{
  const instrument=nativeHostInstrument(packageRoot,entry);
  const bytes=Buffer.from(canonical({scope:place.scope,measure:'id',value:place.value,form:'alphabet',role:'writes',by:'target',at:'policy:fixture'})+'\n'),limits={maxBytes:65536,timeoutMs:2000,records:32};
  const context={place:name,source:'fixture:lot',digest:sha256(bytes),snapshot:rootLotSnapshot(f.root),reading:{instrument:sha256('declared fixture instrument'),implementation:sha256('declared compiled implementation'),policy:sha256('fixture policy'),inputs:[],environment:[['node',sha256(process.version)]] as [string,string][]},limits};
  let signatures=0;
  const ports={root:f.root,instrumentName:instrument.name,runtime:instrument.runtime,read:async()=>bytes,signer:{keyId:'owner',name:'file',sign:async lot=>{signatures++;return lot.bytes.map(bytes=>({keyId:lot.keyId,signature:formatSignature(lot.algorithm,sign(null,Buffer.from(bytes),f.ownerPem).toString('base64'))}))}},limits:{...limits,diagnostics:262144}};
  const before=rootLotSnapshot(f.root);
  for(const which of no.cases){
   let offered=bytes;const controller=new AbortController();let changedPorts=ports;
   if(which==='altered lot bytes')changedPorts={...ports,read:async()=>Buffer.concat([bytes,Buffer.from(' ')])};
   else if(which==='uncovered signer')changedPorts={...ports,signer:{...ports.signer,keyId:'lane'}};
   else if(which==='cancelled before commit')controller.abort();
   else if(which==='noncanonical unsigned Root lot'){offered=Buffer.from(bytes.toString().trimEnd());changedPorts={...ports,read:async()=>offered};}
   else assert.fail('undeclared negative '+which);
   const refused=await landRootLotInProcess({...context,digest:sha256(offered),signal:controller.signal},changedPorts);
   assert.equal(refused.kind,'refuse',which+' '+JSON.stringify(refused));assert.equal(rootLotSnapshot(f.root),before);assert.equal(signatures,0);
  }
  const got=await landRootLotInProcess(context,ports);assert.equal(got.kind,'fact',JSON.stringify(got));assert.ok(got.kind==='fact'&&'identity' in got.value&&got.value.identity);if(got.kind!=='fact'||!('identity' in got.value)||!got.value.identity)throw Error('missing act identity');
  assert.equal(recoverRootActInProcess(got.value.identity,ports).kind,'fact');
  const native=f.run(['fold','--as','act',got.value.identity]);assert.equal(native.status,0,native.stderr);assert.ok(native.stdout.includes('scope='+place.scope));
  const again=await landRootLotInProcess({...context,snapshot:rootLotSnapshot(f.root)},ports);assert.equal(again.kind,'fact');assert.equal(signatures,1);
  console.log(`HOST ${name} · admitted · recovered · held without signing · altered coverage cancellation format refused`);
 }finally{f.close()}
});
test('the host export does not expose internal admission paths',async()=>{
 await assert.rejects(import('@lapxo/bound/dist/cli/accept.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
});
