import {referenceRootFixture} from './support/reference-root.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,sign} from 'node:crypto';
import {canonical,parse,signedBytes,formatSignature} from '@lapxo/topos/wire';
import {inspectAuthenticatedReference,decodeReference,encodeReference,BoundRefusal,readRefusalCatalog,describeRefusal} from '@lapxo/bound/reference';
import {objectFold} from '@lapxo/bound/engine';

const sha=(b:Uint8Array|string)=>'sha256:'+createHash('sha256').update(b).digest('hex');
const repo=new URL('../',import.meta.url),row=(scope:string,measure:string,value:string)=>canonical({scope,measure,value,role:'writes',form:'alphabet',by:'target',at:'policy:fixture'});

for(const place of ['native-reference-export','editorial-delivery'])test('native reference export from a real admitted place '+place,async t=>{
  const {f,yes,no,contracts,toposPin,objects,trust,bundle,ledger,before,targetBefore}=referenceRootFixture(place);
  try{
    await t.test('yes: public export opens with real signatures and the existing engine',async()=>{
      const opened=await inspectAuthenticatedReference(bundle.reference,trust);assert.equal(opened.semanticIdentity,bundle.context.semanticIdentity);assert.deepEqual(opened.contracts,contracts);assert.equal(objectFold(opened.records,objects)[0]?.state,yes.expectedState);console.log('EXPORT real-admission · contracts-bound · signatures-verified · REQUIRED · no commit');
    });
    await t.test('no: an altered carrier byte refuses before projection',async()=>{
      assert.equal(no.mutation,'flip-one-carrier-byte');const bytes=Buffer.from(bundle.carrier);bytes[bytes.length-2]^=1;await assert.rejects(()=>inspectAuthenticatedReference(bundle.reference,{...trust,fetchBytes:async()=>bytes}),e=>{assert.ok(e instanceof BoundRefusal);assert.equal(e.code,'authenticated-reference/integrity');const entry=describeRefusal(e,readRefusalCatalog(readFileSync(new URL('docs/contracts/refusals.bound',repo),'utf8')));assert.equal(entry.category,'integrity');return e.message.includes(no.expectedRefusal)});console.log('REFUSE altered-carrier · blob integrity');
    });
    await t.test('catalog: each authenticated inspection boundary returns its declared code',async()=>{
      const catalog=readRefusalCatalog(readFileSync(new URL('docs/contracts/refusals.bound',repo),'utf8'));
      const code=(expected:string)=>(error:unknown)=>{assert.ok(error instanceof BoundRefusal);assert.equal(error.code,expected);assert.equal(describeRefusal(error,catalog).code,expected);return true;};
      const changed=(bytes:Uint8Array)=>({fragment:encodeReference({...decodeReference(bundle.reference),blob:sha(bytes)}),trust:{...trust,fetchBytes:async()=>bytes}});
      for(const [expected,bytes] of [['framing',Buffer.from([255])],['framing',Buffer.from('{}\n')],['wire',Buffer.from(JSON.stringify(['authenticated-standing@1',[JSON.parse(bundle.carrier)[1][0]+' '],JSON.parse(bundle.carrier)[2]])+'\n')]] as const){
        const value=changed(bytes);await assert.rejects(()=>inspectAuthenticatedReference(value.fragment,value.trust),code('authenticated-reference/'+expected));
      }
      await assert.rejects(()=>inspectAuthenticatedReference(bundle.reference,{...trust,maxRecords:0}),code('authenticated-reference/budget'));
      await assert.rejects(()=>inspectAuthenticatedReference(bundle.reference,{...trust,fetchBytes:async()=>{throw Error('host unavailable')}}),code('authenticated-reference/transport'));
      await assert.rejects(()=>inspectAuthenticatedReference(bundle.reference,{...trust,verifyBytes:async()=>false}),code('authenticated-reference/authority'));
      await assert.rejects(()=>inspectAuthenticatedReference(bundle.reference,{...trust,objects:{...objects,resolve:()=>undefined}}),code('authenticated-reference/object-context'));
      const reference=decodeReference(bundle.reference),{contracts:_,...legacyTrust}=trust;
      await assert.rejects(()=>inspectAuthenticatedReference(encodeReference({...reference,digest:'f'.repeat(64)}),legacyTrust),code('authenticated-reference/identity'));
      const packet=JSON.parse(bundle.carrier),fields={scope:'sample/withdrawn',role:'writes',form:'alphabet',measure:'id',value:'withdraw',by:'owner',epoch:String(trust.epoch),at:'policy:fixture'};
      packet[1].push(canonical({...fields,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(fields)),f.owner.privateKey).toString('base64'))}));
      const proof=parse(packet[2]);assert.equal(proof.kind,'fact');if(proof.kind!=='fact')throw Error('fixture proof');
      const bound={...proof.value.fields,value:sha(JSON.stringify(['authenticated-standing@1',packet[1]])+'\n')};
      packet[2]=canonical({...bound,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(bound)),f.owner.privateKey).toString('base64'))});
      const value=changed(Buffer.from(JSON.stringify(packet)+'\n'));await assert.rejects(()=>inspectAuthenticatedReference(value.fragment,value.trust),code('authenticated-reference/history'));
      console.log('REFUSALS '+place+' · framing wire budget transport authority object-context identity history · named');
    });
    await t.test('no: a changed public resource budget invalidates the context before download',async()=>{
      let fetched=0;await assert.rejects(()=>inspectAuthenticatedReference(bundle.reference,{...trust,maxBytes:trust.maxBytes+1,fetchBytes:async()=>{fetched++;return new Uint8Array()}}),/context snapshot/);assert.equal(fetched,0);
    });
    await t.test('no: a different refusal catalog changes the authenticated snapshot',async()=>{
      await assert.rejects(()=>inspectAuthenticatedReference(bundle.reference,{...trust,contracts:{...contracts,refusals:sha('other catalog')}}),/context snapshot/);
      await assert.rejects(()=>inspectAuthenticatedReference(bundle.reference,{...trust,contracts:{...contracts,standing:sha('other standing contract')}}),/context snapshot/);
      await assert.rejects(()=>inspectAuthenticatedReference(bundle.reference,{...trust,contracts:null}),/contract identities/);
    });
    await t.test('no: an invalid URL does not sign or change the Root',()=>{
      const refused=f.run(['sign','--as','reference','https://secret@example.test/place','--key','owner','--key-file',f.key]);assert.equal(refused.status,1);assert.equal(refused.stdout,'');assert.match(refused.stderr,/reference-export\/source/);const verdict=JSON.parse(refused.stderr.trim().split('\n').at(-1)!);assert.equal(verdict.profile,'bound-refusal@1');assert.equal(verdict.code,'reference-export/source');assert.equal(verdict.catalog,contracts.refusals);assert.equal(verdict.next,'check-source');console.log('REFUSAL '+place+' · reference-export/source · input · check-source · catalog-bound');assert.deepEqual(ledger(),before);
    });
    await t.test('no: a key without proof authority cannot export a snapshot',()=>{
      const refused=f.run(['sign','--as','reference',yes.source,'--key','lane','--key-file',f.key]);assert.equal(refused.status,1);assert.equal(refused.stdout,'');assert.match(refused.stderr,/reference-export\/authority/);assert.deepEqual(ledger(),before);
    });
    await t.test('no: a wrong signing key emits no partial delivery',()=>{
      const wrong=join(f.temp,'wrong.pem');writeFileSync(wrong,f.lanePem,{mode:0o600});const refused=f.run(['sign','--as','reference','https://example.test/place/carrier.json','--key','owner','--key-file',wrong]);assert.equal(refused.status,1);assert.equal(refused.stdout,'');assert.match(refused.stderr,/reference-export\/signer/);assert.deepEqual(ledger(),before);
    });
    await t.test('catalog: native usage, resource, context and historical authority boundaries',()=>{
      const refuse=(args:string[],expected:string)=>{const got=f.run(args);assert.notEqual(got.status,0,got.stdout+got.stderr);const record=JSON.parse(got.stderr.trim().split('\n').at(-1)!);assert.equal(record.code,expected);assert.equal(record.catalog,contracts.refusals);assert.equal(got.stdout,'');};
      const exportArgs=['sign','--as','reference',yes.source,'--key','owner','--key-file',f.key];
      refuse(['sign','--as','reference'],'reference-export/usage');
      refuse(['fold','--unsupported-option'],'operation/usage');
      refuse(['fold','--as','not-declared'],'operation/failed');
      refuse(['fold','--as','standing@1'],'standing/query');
      const change=(lines:string[])=>{const file=join(f.temp,'catalog-change.bound');writeFileSync(file,lines.join('\n')+'\n');const got=f.run(['land',file,'--key','owner','--key-file',f.key]);assert.equal(got.status,0,got.stderr);};
      change([row('reference/records','id','0')]);refuse(exportArgs,'reference-export/budget');
      change([row('reference/records','id','256'),row('reference/authentication','id','unsupported')]);refuse(exportArgs,'reference-export/context');
      change([row('reference/authentication','id','authenticated-standing@1'),row('keys/lane','signer','file')]);
      const laneKey=join(f.temp,'history-lane.pem');writeFileSync(laneKey,f.lanePem,{mode:0o600});const line=join(f.temp,'history-lane.bound');writeFileSync(line,row('region/catalog/items/old','id','admitted')+'\n');
      const landed=f.run(['land',line,'--key','lane','--key-file',laneKey]);assert.equal(landed.status,0,landed.stderr);
      change([row('keys/lane','class','withdraw')]);refuse(exportArgs,'reference-export/history');
      console.log('REFUSALS '+place+' · native usage budget context history query fallback · named');
    });
  }finally{f.close();}
});

test('machine contract sources and quartet members remain directly consumable',()=>{
  const rows=readFileSync(new URL('docs/contracts/refusals.bound',repo),'utf8').trim().split('\n').map(l=>parse(l)).map(p=>{assert.equal(p.kind,'fact');if(p.kind!=='fact')throw Error(p.why);return p.value.fields;});
  const page=readFileSync(new URL('docs/contracts/refusals.md',repo),'utf8');
  for(const code of rows.filter(f=>f.measure==='code')){
    const entries=rows.filter(f=>f.scope===code.scope);assert.deepEqual(entries.map(f=>f.measure).sort(),['class','code','next']);
    const cls=entries.find(f=>f.measure==='class')!,next=entries.find(f=>f.measure==='next')!;assert.ok(page.includes('| '+code.value+' | '+cls.value+' | '+cls.about+' | '+next.value+' |'));
  }
  const quartet=JSON.parse(readFileSync(new URL('docs/contracts/reference-export.publication.json',repo),'utf8'));assert.deepEqual(quartet.members.map((m:{role:string})=>m.role),['contract','yes','vector','no']);
  for(const member of quartet.members)assert.equal(sha(readFileSync(new URL(member.path,repo))),member.digest);
});
