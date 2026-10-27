import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync,writeFileSync,readdirSync}from'node:fs';
import{join,resolve}from'node:path';
import{generateKeyPairSync,sign,verify,createHash}from'node:crypto';
import{canonical,signedBytes,formatSignature,parse}from'@lapxo/topos/wire';
import{nativeHostInstrument}from'../src/host/native-receiver.ts';
import{actingRootFixture}from'./support/acting-root.ts';
import{commitIngress}from'../src/host/ports/ingress.ts';
import{admissionHistoryAt}from'../src/fold/admission-history.ts';
import{epochOf}from'../src/cli/owner.ts';
const api=await import(process.env.BOUND_PREFLIGHT_IMPLEMENTATION??'../src/host/native/authority-card.ts');
const vector=JSON.parse(readFileSync(new URL('../vectors/preflight/receiver-current.json',import.meta.url),'utf8'));
const entry=process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname,instrument=nativeHostInstrument(resolve(entry,'../../..'),entry);
const digest=(v:string|Buffer)=>'sha256:'+createHash('sha256').update(v).digest('hex');
const row=(scope:string,value:string)=>canonical({scope,measure:'id',value,role:'writes',form:'alphabet',by:'target',at:'policy:fixture'});
const inventory=(root:string):unknown=>readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1).map(e=>[e.name,e.isDirectory()?inventory(join(root,e.name)):digest(readFileSync(join(root,e.name)))]);
const fact=(result:any)=>{assert.equal(result.kind,'fact',JSON.stringify(result));assert.ok(result.value?.card);return result.value;};
const refused=(r:any,code?:string)=>{assert.equal(r.kind,'refuse',JSON.stringify(r));assert.equal(typeof r.code,'string');if(code)assert.equal(r.code,code);};
for(const domain of vector.domains)for(const v of vector.cases)test(`current receiver preflight ${v.id}: ${domain}`,async()=>{
 const f=actingRootFixture(domain,[],{entry,fields:'scope|role|form|measure|value|by|at|epoch|sig|about|needs'});
 const land=(records:string[])=>{const file=join(f.temp,'lot.bound');writeFileSync(file,records.join('\n')+'\n');const r=f.run(['land',file,'--key','owner','--key-file',f.key]);assert.equal(r.status,0,r.stderr);};
 try{
  land([row('sample/first','present')]);land([row('sample/second','present')]);assert.equal(epochOf(admissionHistoryAt(f.root,Number.MAX_SAFE_INTEGER)),3);
  const action={kind:'record-coverage',records:[row('items','seen')]},context={root:f.root,place:'catalog',key:'lane',instrument,clock:vector.clock,horizon:{clock:vector.clock.name,unit:vector.clock.unit,from:vector.clock.now,through:vector.clock.now},limits:vector.limits,actions:[action]},request=api.nativeAuthorityRequestIdentity(action);
  const prepare=(extra:object={})=>api.prepareNativeAuthorityCard({...context,...extra});
  if(v.id==='V1'){
   const before=inventory(f.root),current=fact(await prepare()),explicit=fact(await prepare({authorityEpoch:3}));
   assert.deepEqual(current,explicit);assert.equal(current.judgments[0].decision,'allow');assert.deepEqual(inventory(f.root),before);
  }else if(v.id==='V2'){
   const before=fact(await prepare()),remote=generateKeyPairSync('ed25519');
   const stamp=(fields:Record<string,string>,key:any)=>canonical({...fields,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(fields)),key).toString('base64'))});
   const foreignFields={scope:'sample/foreign',measure:'id',value:'observed',role:'writes',form:'alphabet',by:'remote',at:'origin:remote',epoch:'6'},evidence=stamp(foreignFields,remote.privateKey)+'\n',id=digest(evidence);
   const receiptFields={scope:'receipts',measure:'digest',value:id,role:'writes',form:'alphabet',by:'owner',at:'receipt:import',epoch:'4'},receipt=stamp(receiptFields,f.owner.privateKey)+'\n';
   const valid=(line:string,fields:Record<string,string>,pub:any)=>{const p=parse(line.trim());assert.equal(p.kind,'fact');if(p.kind!=='fact')return false;const encoded=p.value.fields.sig!.split(':').at(-1)!;return verify(null,Buffer.from(signedBytes(fields)),pub,Buffer.from(encoded,'base64'));};
   await commitIngress(join(f.root,'.bound'),id,async()=>({evidence,receipt}),bundle=>bundle.evidence===evidence&&bundle.receipt===receipt&&valid(evidence,foreignFields,remote.publicKey)&&valid(receipt,receiptFields,f.owner.publicKey));
   assert.equal(epochOf(admissionHistoryAt(f.root,Number.MAX_SAFE_INTEGER)),3);
   const after=fact(await prepare());assert.deepEqual(after,before);refused(await prepare({authorityEpoch:6}),'authority-preflight/stale-epoch');
  }else if(v.id==='V3'){
   refused(await prepare({root:join(f.temp,'absent')}));const anchors=readdirSync(join(f.root,'.bound')).filter(name=>name.endsWith('.keys'));assert.equal(anchors.length,1);const file=join(f.root,'.bound',anchors[0]!),original=readFileSync(file);try{writeFileSync(file,'corrupt bootstrap anchor\n');refused(await prepare());}finally{writeFileSync(file,original);}
  }else if(v.id==='V4'){
   refused(await prepare({clock:undefined}));refused(await prepare({clock:{...vector.clock,now:NaN}}));const prepared=fact(await prepare());
   const expired=await api.answerNativeAuthorityCard(prepared.card,request,{...context,clock:{...vector.clock,now:vector.clock.now+1}});assert.notEqual(expired.decision,'allow');assert.equal(expired.status,'refused');
  }else if(v.id==='V5'){
   const prepared=fact(await prepare()),other=actingRootFixture(domain+'-other',[],{entry});try{const answer=await api.answerNativeAuthorityCard(prepared.card,request,{...context,root:other.root});assert.notEqual(answer.decision,'allow');}finally{other.close();}
  }else if(v.id==='V6'){
   const prepared=fact(await prepare());const withdrawal=canonical({scope:'keys/lane',measure:'coverage',value:'withdraw',role:'writes',form:'alphabet',by:'target',at:'policy:fixture'});land([withdrawal]);
   const answer=await api.answerNativeAuthorityCard(prepared.card,request,context);assert.deepEqual(answer,{status:'refused',code:'card-stale',next:'refresh-card'});assert.equal(fact(await prepare()).judgments[0].decision,'deny');
  }else if(v.id==='V7'){
   const file=join(f.root,'catalog/TARGET.bound'),original=readFileSync(file);let reads=0;const clock={name:vector.clock.name,unit:vector.clock.unit,get now(){if(++reads===2)writeFileSync(file,Buffer.concat([original,Buffer.from('\n# changed during preparation\n')]));return vector.clock.now;}};
   try{refused(await prepare({clock}),'authority-preflight/context-changed');}finally{writeFileSync(file,original);}
  }else if(v.id==='V8'){
   refused(await prepare({authorityEpoch:6}),'authority-preflight/stale-epoch');refused(await prepare({authorityEpoch:NaN}),'authority-preflight/context');
   const prepared=fact(await prepare()),forged={...prepared.card,authority:digest('forged')};assert.notEqual((await api.answerNativeAuthorityCard(forged,request,context)).decision,'allow');
   const selected={profile:'native-authority-card-request/1',place:context.place,key:context.key,authorityEpoch:3,clock:context.clock,horizon:context.horizon,limits:context.limits,actions:context.actions},text=JSON.stringify(selected);assert.equal(api.parseNativeAuthorityCardRequest(text,digest(text),context.limits).authorityEpoch,3);
   const{authorityEpoch,...missing}=selected,absent=JSON.stringify(missing);assert.throws(()=>api.parseNativeAuthorityCardRequest(absent,digest(absent),context.limits));
  }else throw Error('unimplemented vector '+v.id);
 }finally{f.close();}
});
