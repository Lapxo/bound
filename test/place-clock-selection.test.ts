import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {canonical,parse,signedBytes,type Signer} from '@lapxo/topos/wire';
import {placeActContextBytes,originContextBytes,placeReceiptBytes,verifyPlaceActContext,type TrustedClockContract} from '@lapxo/topos/core';
import {signBytes} from '../src/host/adapters/keys/ed25519.ts';
import {hostClockSelection,type HostClockInput,type HostClockSelection} from '../src/host/place-clock-selection.ts';
import {fieldOf} from '../src/fold/claims.ts';
import {commitPlaceAct,placeActResult} from '../src/host/ports/place-act.ts';
const algorithm='ed25519:sample',selector='wire/place-act-context-selection',profileSelector='wire/place-act-context';
const nativeCaptures:unknown[]=[];
function fixture(){
 const pair=generateKeyPairSync('ed25519'),lane=generateKeyPairSync('ed25519'),root=mkdtempSync(join(tmpdir(),'bound-clock-selection-'));
 const pem=pair.privateKey.export({format:'pem',type:'pkcs8'}).toString(),lanePem=lane.privateKey.export({format:'pem',type:'pkcs8'}).toString();
 const anchor:Signer={id:'owner',keyClass:'authorize',publicKey:pair.publicKey.export({format:'der',type:'spki'}).toString('base64'),coverage:['*'],depth:{lo:1,hi:16},admittedBy:[]};
 const signed=(scope:string,measure:string,value:string,epoch:string,extra={})=>{const fields={scope,measure,value,epoch,by:'owner',role:'writes',form:'alphabet',at:'policy:fixture',...extra};return canonical({...fields,sig:signBytes(signedBytes(fields),pem,algorithm)})};
 const selection:HostClockSelection={profile:'place-act-context@1',namespace:'.',regionFamily:'region',receiptSigner:'owner',receiptScope:'receipts',digestAlgorithm:'sha256',budget:{bytes:65536,records:64,placements:2,policies:64,proofs:8,signers:8},storageBudget:{acts:8,bytes:65536},initial:['catalog','inventory'].map(p=>({place:p+'/TARGET.bound',receiver:{identity:'initial:'+p,epoch:'1'},origin:{prefix:'local-prefix:'+p,epoch:'2'}}))};
 const history=[signed(profileSelector,'id','place-act-context@1','1'),signed('wire/era','id','sample','1'),signed('wire/signature-algorithms','id',algorithm,'1'),signed('wire/digest-algorithms','id','sha256','1'),signed('wire/families','id','region|wire|keys|receipts','1'),signed('region/catalog','coordinates','catalog/**','1'),signed('region/inventory','coordinates','inventory/**','1'),signed('keys/lane','class','attest','5'),signed('keys/lane','public-key',lane.publicKey.export({format:'der',type:'spki'}).toString('base64'),'5'),signed('keys/lane','coverage','region/catalog/items|region/inventory/items','5'),signed('keys/lane','resolution','1..16','5',{form:'interval'}),signed(selector,'text','lock','6',{about:JSON.stringify(selection)})];
 let current=history;const checkpoint=history.at(-1)!;let historical:TrustedClockContract|undefined;
 const input:HostClockInput={store:join(root,'.bound'),selector,profileSelector,history,anchor,algorithms:[algorithm],legacyOriginals:[],authorityCheckpoint:checkpoint,resources:{bytes:131072,lines:128,places:2},inherited:{clock:selection.budget,storage:selection.storageBudget},readCurrent:()=>({...input,history:current,authorityCheckpoint:current.filter(l=>{const p=parse(l);return p.kind==='fact'&&p.value.fields.by==='owner'&&p.value.fields.role==='writes'}).at(-1)!}),historical:()=>historical??assert.fail('historical fixture not selected')};
 const prepare=(incoming:HostClockInput=input)=>{const chosen=hostClockSelection(incoming);historical=chosen.trust.contract;const contract=chosen.trust.contract;
  const originalFields={scope:'items/value',role:'writes',form:'alphabet',measure:'id',value:'retained',epoch:'2',by:'lane',at:'policy:fixture'};const original=canonical({...originalFields,sig:signBytes(signedBytes(originalFields),lanePem,algorithm)});
  const places=selection.initial.map(i=>({place:i.place,previous:i.receiver.identity,epoch:i.origin.epoch,originPrefix:i.origin.prefix,records:[original],proofs:[] as {by:string;signature:string}[]}));
  for(const p of places)p.proofs=[{by:'lane',signature:signBytes(originContextBytes(contract.root,p,'lane',contract.budget),lanePem,algorithm)}];
  const encoded=placeActContextBytes({root:contract.root,places},contract.budget),id=contract.digest(encoded),receipts=places.map(p=>({place:p.place,by:'owner',signature:signBytes(placeReceiptBytes(id,p,contract.root,'owner','receipts',contract.budget),pem,algorithm)}));return{chosen,encoded,receipts,original};
 };
 return{root,input,history,selection,signed,prepare,pem,anchor,delegated:()=>{const fields={scope:'region/catalog/items/value',role:'writes',form:'alphabet',measure:'id',value:'old-authentic',epoch:'6',by:'lane',at:'policy:fixture'};return canonical({...fields,sig:signBytes(signedBytes(fields),lanePem,algorithm)})},setCurrent:(h:readonly string[])=>{current=h}};
}
test('fixed host constructor authenticates root6/grant5 while unchanged local originals remain epoch2 in two places',async()=>{
 const f=fixture();try{const p=f.prepare();verifyPlaceActContext(p.encoded,p.chosen.trust.contract);assert.equal(p.chosen.trust.contract.root.epoch,'6');assert.match(p.original,/epoch=2 /);assert.equal((await commitPlaceAct(f.input.store,p.encoded,p.receipts,p.chosen.trust,f.selection.storageBudget)).kind,'landed')}finally{rmSync(f.root,{recursive:true,force:true})}
});
test('namespace segment boundaries refuse missing leaves, empty parents and traversal',()=>{
 const f=fixture();try{const chosen=hostClockSelection(f.input),contract=chosen.trust.contract;assert.equal(contract.verifiesNamespaceAdmission('catalog/TARGET.bound',contract.root),true);for(const place of ['catalog/other','TARGET.bound','/TARGET.bound','catalog//TARGET.bound','catalog/../TARGET.bound','catalog/TARGET.bound/'])assert.equal(contract.verifiesNamespaceAdmission(place,contract.root),false,place);}finally{rmSync(f.root,{recursive:true,force:true})}
});
test('protected current reread observes retirement between preparation and commit',async()=>{
 const f=fixture();try{const p=f.prepare();f.setCurrent([...f.history,f.signed('keys/lane','class','withdraw','7',{role:'writes'})]);await assert.rejects(commitPlaceAct(f.input.store,p.encoded,p.receipts,p.chosen.trust,f.selection.storageBudget),/authority changed/)}finally{rmSync(f.root,{recursive:true,force:true})}
});
test('selector withdrawal and replacement select live declaration rather than retired originals',()=>{
 const f=fixture();try{const withdrawal=f.signed(selector,'text','withdraw','7',{about:JSON.stringify(f.selection)}),selection={...f.selection,namespace:'new-root'},replacement=f.signed(selector,'text','lock','8',{about:JSON.stringify(selection)});const h=[...f.history,withdrawal,replacement];const chosen=hostClockSelection({...f.input,history:h,authorityCheckpoint:replacement});assert.equal(chosen.selection.namespace,'new-root')}finally{rmSync(f.root,{recursive:true,force:true})}
});
test('authentic old delegated grant history survives subsequent retirement; current context grants none',()=>{
 const f=fixture();try{const p=f.prepare(),retired=f.signed('keys/lane','class','withdraw','7');const chosen=hostClockSelection({...f.input,history:[...f.history,f.delegated(),retired],authorityCheckpoint:retired});assert.equal(chosen.trust.contract.root.epoch,'7');assert.throws(()=>verifyPlaceActContext(p.encoded,chosen.trust.contract),/unauthenticated authority context/)}finally{rmSync(f.root,{recursive:true,force:true})}
});
test('unknown checkpoints, incomplete selected budgets and excess resources refuse',()=>{
 const f=fixture();try{assert.throws(()=>hostClockSelection({...f.input,authorityCheckpoint:'not signed'}),/authority checkpoint/);const malformed={...f.selection,budget:{bytes:65536}};const changed=f.signed(selector,'text','lock','6',{about:JSON.stringify(malformed)});assert.throws(()=>hostClockSelection({...f.input,history:[...f.history.slice(0,-1),changed],authorityCheckpoint:changed}),/selected resources/);assert.throws(()=>hostClockSelection({...f.input,resources:{...f.input.resources,bytes:16384}}),/resources exceed/)}finally{rmSync(f.root,{recursive:true,force:true})}
});
test('exact selector grammar admits through native bootstrap in two unrelated formed places',()=>{
 for(const name of ['catalog-root','inventory-root']){const f=fixture();try{
  const root=join(f.root,name);mkdirSync(root);for(const child of ['catalog','inventory']){mkdirSync(join(root,child));writeFileSync(join(root,child,'TARGET.bound'),'')}
  const key=join(f.root,'fixture.pem');writeFileSync(key,f.pem,{mode:0o600});
  const row=(scope:string,measure:string,value:string,about?:string)=>canonical({scope,measure,value,form:'alphabet',role:'writes',by:'target',at:'policy:fixture',...(about?{about}:{})});
  const lines=[row('wire/era','id','sample'),row('wire/signature-algorithms','id',algorithm),row('wire/digest-algorithms','id','sha256')];
  for(const [name,value] of Object.entries({fields:'scope|role|form|measure|value|by|at|epoch|sig|about',required:'scope|role|form|measure|value|by|at',forms:'alphabet|interval',roles:'reads|writes|demands','at-classes':'policy|place|origin|witness|receipt',families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region'}))lines.push(row('wire/'+name,'id',value));
  lines.push(row('keys/owner','class','authorize'),row('keys/owner','coverage','*'),row('keys/owner','public-key',f.anchor.publicKey),row('keys/owner','signer','file'),row('keys/reader','class','read'),row('region/catalog','coordinates','catalog/**'),row('region/inventory','coordinates','inventory/**'),row(profileSelector,'id','place-act-context@1'),row(selector,'text','lock',JSON.stringify(f.selection)));
  for(const [scope,measure,value] of [['keys/owner','resolution','1..16'],['signer/timeout','milliseconds','5000..5000'],['signer/response-bytes','bytes','65536..65536']])lines.push(canonical({scope:scope!,measure:measure!,value:value!,form:'interval',role:'writes',by:'target',at:'policy:fixture'}));
  writeFileSync(join(root,'TARGET.bound'),lines.join('\n')+'\n');const cli=process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname;
  const result=spawnSync(process.execPath,[cli,'land','--key','owner','--key-file',key],{cwd:root,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},encoding:'utf8',timeout:15000,maxBuffer:65536});nativeCaptures.push({place:name,args:['land','--key','owner','--key-file','[fixture]/fixture.pem'],status:result.status,stdout:result.stdout,stderr:result.stderr});if(process.env.BOUND_CLOCK_CAPTURE)writeFileSync(process.env.BOUND_CLOCK_CAPTURE,JSON.stringify({state:'native selector admission only; contextual CLI quartet unpaid',captures:nativeCaptures},null,2)+'\n');assert.equal(result.status,0,result.stderr);assert.ok(readFileSync(join(root,'TARGET.bound'),'utf8').includes('place-act-context@1'));
 }finally{rmSync(f.root,{recursive:true,force:true})}}
});
test('complete authenticated prefix retains retired declarations while effective head/policies omit them',()=>{
 const f=fixture();try{const previous=hostClockSelection(f.input),withdrawal=f.signed(selector,'text','withdraw','7',{about:JSON.stringify(f.selection)}),replacement=f.signed(selector,'text','lock','8',{about:JSON.stringify({...f.selection,namespace:'revised'})}),next=hostClockSelection({...f.input,history:[...f.history,withdrawal,replacement],authorityCheckpoint:replacement});
 assert.notEqual(next.trust.contract.root.prefix,next.trust.contract.root.head);assert.notEqual(next.trust.contract.root.prefix,previous.trust.contract.root.prefix);assert.ok(!next.trust.contract.root.policies.includes(previous.trust.contract.digest(f.history.at(-1)!)));assert.ok(next.trust.contract.root.policies.includes(next.trust.contract.digest(replacement)));
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
test('Root-signed selector cannot exceed fixed inherited clock limits',()=>{
 const f=fixture();try{assert.throws(()=>hostClockSelection({...f.input,inherited:{...f.input.inherited,clock:{...f.input.inherited.clock,proofs:1}}}),/clock resource exceeds inherited proofs/)}finally{rmSync(f.root,{recursive:true,force:true})}
});
test('withdrawn region refuses new contextual namespace while old committed result remains authenticated history',async()=>{
 const f=fixture();try{const old=f.prepare();const committed=await commitPlaceAct(f.input.store,old.encoded,old.receipts,old.chosen.trust,f.selection.storageBudget);
 const withdrawal=f.signed('region/catalog','coordinates','withdraw','7'),next=f.prepare({...f.input,history:[...f.history,withdrawal],authorityCheckpoint:withdrawal});
 assert.throws(()=>verifyPlaceActContext(next.encoded,next.chosen.trust.contract),/namespace not admitted/);
 const historical=placeActResult(f.input.store,committed.identity,{historical:()=>old.chosen.trust.contract},f.selection.storageBudget);assert.equal(historical?.context,old.encoded);
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
test('wrong namespace declaration measure and conflicting live declarations grant no membership',()=>{
 const f=fixture();try{const replacement=f.signed('region/catalog','id','catalog/**','7'),h=f.history.filter(l=>{const p=parse(l);return p.kind!=='fact'||p.value.fields.scope!=='region/catalog'});const wrong=hostClockSelection({...f.input,history:[...h,replacement],authorityCheckpoint:replacement});assert.equal(wrong.trust.contract.verifiesNamespaceAdmission('catalog/TARGET.bound',wrong.trust.contract.root),false);
 const conflicting=f.signed('region/catalog','coordinates','catalog/other/**','1');assert.throws(()=>hostClockSelection({...f.input,history:[...f.history,conflicting]}),/region\/catalog.*two live inscriptions/);
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
test('profile body does not override missing, mismatched or ambiguous live id selector',()=>{
 const f=fixture();try{const without=f.history.filter(l=>!l.includes('measure=id ')||!l.includes('scope='+profileSelector+' '));assert.throws(()=>hostClockSelection({...f.input,history:without}),/clock profile id/);
 const wrong=f.signed(profileSelector,'id','local-act@1','1');assert.throws(()=>hostClockSelection({...f.input,history:[...without,wrong]}),/clock profile id/);
 const conflict=f.signed(profileSelector,'id','local-act@1','1');assert.throws(()=>hostClockSelection({...f.input,history:[...f.history,conflict]}),/clock profile id|two live inscriptions/);
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
test('numeric clock and nontext selector scalars refuse by name without coercion or TypeError',()=>{
 const f=fixture();try{
  const replacements=[{...f.selection,initial:[{...f.selection.initial[0]!,receiver:{...f.selection.initial[0]!.receiver,epoch:1}},f.selection.initial[1]!]},{...f.selection,namespace:3},{...f.selection,initial:[{...f.selection.initial[0]!,place:3},f.selection.initial[1]!]}];
  for(const value of replacements){const row=f.signed(selector,'text','lock','6',{about:JSON.stringify(value)});assert.throws(()=>hostClockSelection({...f.input,history:[...f.history.slice(0,-1),row],authorityCheckpoint:row}),/REFUSE·clock selection (unknown clock|unsupported selector shape|unknown initial namespace)/)}
 }finally{rmSync(f.root,{recursive:true,force:true})}
});

test('declared digest era names retain the public wire algorithm interpretation',()=>{
 const f=fixture();try{const history=f.history.map(l=>fieldOf(l,'scope')==='wire/digest-algorithms'?f.signed('wire/digest-algorithms','id','sha256:sample','1'):l);const p=f.prepare({...f.input,history});verifyPlaceActContext(p.encoded,p.chosen.trust.contract);assert.equal(p.chosen.selection.digestAlgorithm,'sha256')}finally{rmSync(f.root,{recursive:true,force:true})}
});

test('syntax retention never retains current clock, source authentication or noncanonical bytes',()=>{
 const f=fixture();try{
  const prepared=f.prepare(),before=prepared.chosen.trust.current().root;
  // Same exact history is warm; a new genuine signed configuration remains a new act.
  const next=f.signed('region/catalog/items/checkpoint','id','changed-policy','7');
  f.setCurrent([...f.history,next]);const after=prepared.chosen.trust.current().root;
  assert.equal(after.epoch,'7');assert.notEqual(after.head,before.head);
  const got=parse(f.history.at(-1)!);assert.equal(got.kind,'fact');if(got.kind!=='fact')return;
  // Canonical new bytes with the old signature must still fail authentication.
  const altered=canonical({...got.value.fields,about:JSON.stringify({...f.selection,namespace:'unsigned-change'})});
  f.setCurrent([...f.history.slice(0,-1),altered]);
  assert.throws(()=>prepared.chosen.trust.current(),/history not authenticated/);
  // Parsed fields can coincide after whitespace normalization; raw bytes cannot.
  const noncanonical=f.history.at(-1)!.replace('bound-lock/1 ','bound-lock/1  ');
  f.setCurrent([...f.history.slice(0,-1),noncanonical]);
  assert.throws(()=>prepared.chosen.trust.current(),/noncanonical history/);
  f.setCurrent(f.history);assert.equal(prepared.chosen.trust.current().root.epoch,before.epoch);
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
