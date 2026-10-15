import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,verify,createPublicKey} from 'node:crypto';
import {readPlaceActContext,type TrustedClockContract} from '@lapxo/topos/core';
import {parse,signedBytes,parseSignature,signersOf,canonical} from '@lapxo/topos/wire';
const FIXTURE_ANCHOR={id:'owner',publicKey:'MCowBQYDK2VwAyEAafzF/Ch8FOs30s6ktPN6gGfJQiLJ4Z1sQU5s27ggrmc=',keyClass:'authorize',coverage:['*'],depth:{lo:1,hi:16},admittedBy:[]} as const;
import {commitPlaceAct,placeActHeads,placeActResult,type PlaceActTrust} from '../src/host/ports/place-act.ts';
const sample=JSON.parse(readFileSync(new URL('../samples/place-act-context/yes.json',import.meta.resolve('@lapxo/topos/core')),'utf8'));
const digest=(s:string)=>'sha256:'+createHash('sha256').update(s).digest('hex');
const fields=(line:string)=>{const p=parse(line);if(p.kind!=='fact')throw Error('malformed fixture');return p.value.fields};
const verifies=(bytes:string,sig:string,key:string)=>{const s=parseSignature(sig);return s?.algorithm==='ed25519:sample'&&verify(null,Buffer.from(bytes),createPublicKey({key:Buffer.from(key,'base64'),format:'der',type:'spki'}),Buffer.from(s.raw,'base64'))};
const signed=(f:Readonly<Record<string,string>>,key:string)=>verifies(signedBytes(f),f.sig!,key);
function fixture(){
 const root=readPlaceActContext(sample.context,sample.budget).root;
 const signers=signersOf(sample.rootPrefix.map(fields),FIXTURE_ANCHOR,(f,key)=>signed(f,key)).admitted;
 const prefix=digest(sample.rootPrefix.join('\n')+'\n');
 const contract:TrustedClockContract={root,signers,budget:sample.budget,places:['catalog/TARGET.bound','inventory/TARGET.bound'],regionFamily:'region',receiptSigner:FIXTURE_ANCHOR.id,receiptScope:'receipts',digest,
  verifiesRootContext:c=>c.prefix===prefix&&c.head===prefix&&verifies(JSON.stringify(c)+'\n',sample.rootProof,FIXTURE_ANCHOR.publicKey)&&sample.rootPrefix.every((l:string)=>signed(fields(l),FIXTURE_ANCHOR.publicKey)),
  verifiesNamespaceAdmission:p=>sample.rootPrefix.some((l:string)=>{const f=fields(l),n=p.slice(0,-'/TARGET.bound'.length);return f.scope==='region/'+n&&f.value===n+'/**'&&signed(f,FIXTURE_ANCHOR.publicKey)}),
  verifiesNewLocalPrefix:(p,prefix,epoch,records)=>epoch==='2'&&prefix===digest('origin:'+p+':2')&&records.length===1&&records[0]===sample.original&&!sample.rootPrefix.includes(records[0]),
  verifiesOriginal:(l,s)=>signed(fields(l),s.publicKey),verifiesProof:(b,sig,s)=>verifies(b,sig,s.publicKey)};
 const context=readPlaceActContext(sample.context,sample.budget),heads=context.places.map(p=>({place:p.place,identity:p.previous,epoch:'1'}));
 return{contract,context,current:{root,heads}};
}
const limits={acts:8,bytes:65536};
function formed(){const f=fixture(),root=mkdtempSync(join(tmpdir(),'bound-place-act-')),store=join(root,'.bound');const trust:PlaceActTrust={contract:f.contract,initialHeads:f.current.heads,current:()=>f.current,historical:()=>f.contract};return{...f,root,store,trust}}
test('two declared receiver chains publish one context and unchanged signed originals atomically',async()=>{
 const f=formed();try{const got=await commitPlaceAct(f.store,sample.context,sample.receipts,f.trust,limits);assert.equal(got.kind,'landed');assert.equal(got.identity,sample.expected.identity);
 assert.deepEqual(got.originals,[[sample.original],[sample.original]]);const stored=placeActResult(f.store,got.identity,f.trust,limits);assert.equal(stored?.context,sample.context);
 const heads=placeActHeads(f.store,f.current.heads,f.trust,limits);assert.equal(heads.length,2);assert.ok(heads.every(h=>h.epoch==='2'&&h.identity===got.identity));assert.equal(fields(sample.original).epoch,'2');assert.equal(f.current.root.epoch,'6');
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
test('replay returns the original historical bundle without new epoch or current-authority permission',async()=>{
 const f=formed();try{const first=await commitPlaceAct(f.store,sample.context,sample.receipts,f.trust,limits),again=await commitPlaceAct(f.store,sample.context,sample.receipts,{...f.trust,current:()=>{throw Error('current authority must not be used to revive old result')}},limits);
 assert.equal(again.kind,'once');assert.equal(again.identity,first.identity);assert.deepEqual(again.originals,first.originals);assert.equal(readdirSync(join(f.store,'ledger','place-acts')).filter(n=>n.startsWith('committed-')).length,1);
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
test('a committed identity does not make substituted or incomplete replay receipts valid',async()=>{
 const f=formed();try{
  const first=await commitPlaceAct(f.store,sample.context,sample.receipts,f.trust,limits);
  const before=placeActResult(f.store,first.identity,f.trust,limits),heads=placeActHeads(f.store,f.current.heads,f.trust,limits);
  const historyOnly={...f.trust,current:()=>{throw Error('replay must not acquire current authority')}};
  for(const receipts of [sample.scopeSubstitutionReceipts,sample.receipts.slice(0,1)]){
   await assert.rejects(commitPlaceAct(f.store,sample.context,receipts,historyOnly,limits),/receipt signature|incomplete/);
   assert.deepEqual(placeActResult(f.store,first.identity,f.trust,limits),before);
   assert.deepEqual(placeActHeads(f.store,f.current.heads,f.trust,limits),heads);
  }
  assert.equal((await commitPlaceAct(f.store,sample.context,sample.receipts,historyOnly,limits)).kind,'once');
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
test('authority or receiver-head movement at guarded publication refuses without a visible result',async()=>{
 for(const altered of ['authority','head']){const f=formed();try{const current=altered==='authority'?{...f.current,root:{...f.current.root,epoch:'7'}}:{...f.current,heads:[{...f.current.heads[0]!,identity:'changed'},f.current.heads[1]!]};await assert.rejects(commitPlaceAct(f.store,sample.context,sample.receipts,{...f.trust,current:()=>current},limits),/authority changed|head moved|snapshot is not committed head/);assert.equal(placeActResult(f.store,sample.expected.identity,f.trust,limits),undefined)}finally{rmSync(f.root,{recursive:true,force:true})}}
});
test('interruption before rename exposes no member or receiver head; retry can publish intact',async()=>{
 const f=formed();try{await assert.rejects(commitPlaceAct(f.store,sample.context,sample.receipts,f.trust,limits,{publish(){throw Error('controlled interruption before visibility')}}),/controlled interruption/);
 assert.equal(placeActResult(f.store,sample.expected.identity,f.trust,limits),undefined);assert.deepEqual(placeActHeads(f.store,f.current.heads,f.trust,limits),f.current.heads);assert.deepEqual(readdirSync(join(f.store,'ledger','place-acts')),[]);
 assert.equal((await commitPlaceAct(f.store,sample.context,sample.receipts,f.trust,limits)).kind,'landed');
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
test('receipt scope substitution, missing receipts and absent budgets refuse before publication',async()=>{
 const f=formed();try{await assert.rejects(commitPlaceAct(f.store,sample.context,sample.scopeSubstitutionReceipts,f.trust,limits),/receipt signature/);await assert.rejects(commitPlaceAct(f.store,sample.context,sample.receipts.slice(0,1),f.trust,limits),/incomplete/);await assert.rejects(commitPlaceAct(f.store,sample.context,sample.receipts,f.trust,{acts:0,bytes:65536}),/storage budget/);assert.equal(placeActResult(f.store,sample.expected.identity,f.trust,limits),undefined)}finally{rmSync(f.root,{recursive:true,force:true})}
});
