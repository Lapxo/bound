import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {contextualActFixture} from './support/contextual-act.ts';
import {contextualStandingSnapshot} from '../src/host/contextual-place.ts';
import {readContextualStandingInProcess} from '../src/host/in-process-context.ts';
import {admissionAnchor} from '../src/fold/admission-history.ts';
import {sha256} from '../src/host/hash.ts';

const tree=(at:string):string=>sha256(readdirSync(at).sort().map(n=>{const p=join(at,n);return n+':'+(statSync(p).isDirectory()?tree(p):sha256(readFileSync(p)))}).join('\n'));
for(const name of ['water-laboratory','public-library'])test(`complete contextual standing equals the native carrier: ${name}`,async()=>{
 const f=contextualActFixture(name,name==='public-library'?['books','reference-desk']:['catalog','inventory']);
 try{
  const file=join(f.temp,'packet.json');
  for(const [places,value] of [[f.placeNames,'observed'],[[f.placeNames[0]!],'withdraw']] as const){writeFileSync(file,JSON.stringify(f.packet(places,value))+'\n');const landed=f.run(['land',file]);assert.equal(landed.status,0,landed.stderr)}
  const native=f.run(['fold','--as','standing']);assert.equal(native.status,0,native.stderr);
  const snapshot=contextualStandingSnapshot(f.root),bytes=Buffer.from(JSON.stringify(snapshot)+'\n'),before=tree(f.root);
  const context={place:name,source:'snapshot:'+name,snapshot:sha256(bytes),anchor:admissionAnchor(f.root),reading:{instrument:sha256('fixture instrument'),implementation:sha256('fixture implementation'),policy:sha256('fixture policy'),inputs:[],environment:[['node',sha256(process.version)]] as [string,string][]},limits:{timeoutMs:2000,maxBytes:262144,records:2048}};
  const got=await readContextualStandingInProcess(context,{read:async()=>bytes});assert.equal(got.kind,'fact',got.kind==='refuse'?got.diagnostic:'');if(got.kind!=='fact')return;
  assert.deepEqual(got.value.standing,JSON.parse(native.stdout));assert.equal(tree(f.root),before);
  assert.equal(got.value.standing.contexts.length,2);assert.ok(got.value.standing.places.find(p=>p.place===f.placeNames[0]+'/TARGET.bound')!.retracted.length);
  const again=await readContextualStandingInProcess(context,{read:async()=>bytes});assert.deepEqual(again,got);
  const altered=await readContextualStandingInProcess(context,{read:async()=>Buffer.concat([bytes,Buffer.from('x')])});assert.equal(altered.kind,'refuse');if(altered.kind==='refuse')assert.equal(altered.code,'host-port/integrity');
  // A valid transport digest does not authenticate substituted receiver evidence.
  const tampered={...snapshot,contexts:snapshot.contexts.map((row,i)=>i?row:{...row,receipts:row.receipts.map((r,j)=>j?r:{...r,signature:'ed25519:sample:AAAA'})})};
  const bad=Buffer.from(JSON.stringify(tampered)+'\n');const rejected=await readContextualStandingInProcess({...context,snapshot:sha256(bad)},{read:async()=>bad});assert.equal(rejected.kind,'refuse');
  const limited=await readContextualStandingInProcess({...context,limits:{...context.limits,records:1}},{read:async()=>bytes});assert.equal(limited.kind,'refuse');
  assert.equal(tree(f.root),before);
 }finally{f.close()}
});
