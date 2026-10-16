import{test}from'node:test';import assert from'node:assert/strict';
import{readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';import{createHash,createPublicKey,verify}from'node:crypto';
import{parse,parseSignature}from'@lapxo/topos/wire';
import{inspectAuthenticatedReference,BoundRefusal}from'@lapxo/bound/reference';import{openAuthenticatedReference}from'@lapxo/bound/reference/native';import{objectFold}from'@lapxo/bound/engine';
import{referenceWorldFixture}from'./support/reference-world.ts';
// Fixture preparation uses the existing host authority/context, never a second verifier or form implementation.
import{prepareNativeReference}from'../dist/host/reference-native.js';import{authorityFor,rootSigner}from'../dist/fold/signers.js';import{lockStanding,lockLines}from'../dist/fold/keys.js';import{eraOf}from'../dist/fold/digests.js';
const root=new URL('../',import.meta.url),model=JSON.parse(readFileSync(new URL('samples/authenticated-reference/compatibility.json',root),'utf8')),sha=(b:string|Uint8Array)=>'sha256:'+createHash('sha256').update(b).digest('hex');
for(const place of model.places)test('legacy authenticated carrier compatibility '+place.place,async()=>{
 const fixture=await referenceWorldFixture(),temp=mkdtempSync(join(tmpdir(),'bound-reference-compatibility-')),store=join(temp,'.bound'),files=new URL('samples/authenticated-reference/yes/'+place.place+'/',root),target=readFileSync(new URL('TARGET.bound',files));
 try{
  writeFileSync(join(temp,'TARGET.bound'),target);mkdirSync(join(store,'cas/blobs'),{recursive:true});for(const[id,bytes]of fixture.members)writeFileSync(join(store,'cas/blobs',id.slice(7)),bytes,{mode:0o444});
  const formed=spawnSync(process.execPath,[new URL('dist/cli/verb.js',root).pathname,'land','--key','device'],{cwd:temp,encoding:'utf8',timeout:10000,maxBuffer:2097152});assert.equal(formed.status,0,formed.stderr);
  const standing=lockStanding(store),era=eraOf(standing),authority=authorityFor(lockLines(store),rootSigner(temp),era.admitted),held=await prepareNativeReference(temp);
  const one=(scope:string)=>{const found=standing.map(parse).filter(p=>p.kind==='fact'&&p.value.fields.scope===scope);assert.equal(found.length,1);return found[0].value.fields.value;};
  const trust={snapshot:one('reference/snapshot'),epoch:Number(one('reference/epoch')),proofScope:one('reference/proof-scope'),policy:held.policy,formImplementation:held.formImplementation,signers:authority.admitted,algorithms:era.admitted,objects:held.context,maxBytes:2097152,maxRecords:Number(one('reference/records')),digestBytes:sha,verifyBytes:(bytes:string,key:string,sig:string,algorithms:readonly string[])=>{const p=parseSignature(sig);if(!p||!algorithms.includes(p.algorithm))return false;try{return verify(null,Buffer.from(bytes),createPublicKey({key:Buffer.from(key,'base64'),format:'der',type:'spki'}),Buffer.from(p.raw,'base64'))}catch{return false}}};
  let comparable:string|undefined;
  for(const c of place.cases){
   const carrierPath=c.inputs.find((p:string)=>p.endsWith('/'+(c.name==='blob'||c.name==='standing'?'yes':c.name)+'.json')&&!p.includes('/transport.'));assert.ok(carrierPath);const carrier=readFileSync(new URL(carrierPath,root));
   const open=()=>inspectAuthenticatedReference(c.reference,{...trust,fetchBytes:async()=>carrier});
   if(c.exit===0){const got=await open(),readings=objectFold(got.records,held.context),output='AUTHENTICATED standing '+got.semanticIdentity+'\n'+readings.map(r=>'CELL '+JSON.stringify(r)).join('\n');for(const m of c.matches)assert.match(output,new RegExp(m.pattern));const bytes=JSON.stringify(readings);if(comparable===undefined)comparable=bytes;else assert.equal(bytes,comparable);}
   else await assert.rejects(open,error=>{assert.ok(error instanceof BoundRefusal);for(const m of c.matches)assert.match(error.message,new RegExp(m.pattern));return true});
  }
  await assert.rejects(()=>openAuthenticatedReference(temp,place.cases[0].reference),error=>error instanceof BoundRefusal&&error.code==='reference/backend');
  assert.deepEqual(readFileSync(join(temp,'TARGET.bound')),target);
  console.log('COMPAT '+place.place+' · original signatures · yes and arrival byte-equal · signature coverage era order blob standing refused · native backend required');
 }finally{rmSync(temp,{recursive:true,force:true})}
});
