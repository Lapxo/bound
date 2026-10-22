import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical,PROTOCOL} from '@lapxo/topos/wire';
import {fullDigest} from '../src/host/digest.ts';
import {readingExecution} from '../src/host/reading-context.ts';
import {readingClosures} from '../src/host/reading-closures.ts';
import {prepareReadingIdentities} from '../src/host/reading-preparation.ts';
import type {Capsule} from '../src/host/capsule.ts';
const hash=(text:string)=>fullDigest(text,'sha256');
for(const sample of ['origins','stock'])test('public preparation retains execution identity and opens unpaid receipt dependencies: '+sample,()=>{
 const root=mkdtempSync(join(tmpdir(),'reading-preparation-'));let reads=0,probes=0;
 try{
  writeFileSync(join(root,'input.txt'),sample);
  const capsule={digest:hash('implementation'),lines:[],declaration:{regions:{}},ask:(requests:any[])=>requests.map(req=>req.verb==='render'?(probes++,{protocol:PROTOCOL,kind:'fact',lines:[canonical({scope:sample,role:'reads',form:'alphabet',measure:'reads',value:'input.txt',at:'receipt:1'}),canonical({scope:sample+'/total',role:'reads',form:'alphabet',measure:'reads',needs:sample,at:'receipt:1'})]}):(reads++,{protocol:PROTOCOL,kind:'fact',claims:[{scope:'seen/'+req.rootScope,role:'reads',measure:'count',bound:{kind:'interval',lo:1,hi:1}}]}))} as Capsule;
  const execution=readingExecution({instrument:hash('instrument'),implementation:capsule.digest,policy:hash('policy'),inputs:[['transitive',hash('dependency')]]},hash,{env:{},cwd:root,flags:[]});
  const options={root,store:join(root,'.bound'),reader:sample,speaker:'reader',digest:hash,capsule,region:'reading',projection:'inputs',execution,context:execution.context,files:[{place:'input.txt',text:sample}]};
  const preparationLimits={bytes:65536,files:8,readings:8,probes:1};
  const prepare=(extra:object={})=>prepareReadingIdentities({...options,preparationLimits,...extra});
  const first=prepare();assert.equal(first.kind,'fact');if(first.kind!=='fact')return;
  assert.equal(first.probes,1);assert.equal(probes,1,'one projection request is counted separately from final readings');
  assert.equal(reads,0);assert.equal(existsSync(options.store),false,'preparation writes no reading journal or carrier');
  assert.equal(first.readings[0]!.kind,'ready');assert.deepEqual(first.readings[1],{scope:sample+'/total',kind:'needs',needs:[sample]});
  const executed=readingClosures(options);assert.equal(executed.opened,2);assert.equal(reads,2);
  const probesBeforePreparation=probes;
  const next=prepare();assert.equal(next.kind,'fact');if(next.kind!=='fact')return;
  assert.equal(next.probes,1);assert.equal(probes-probesBeforePreparation,1,'retained evidence does not suppress or duplicate the projection probe counter');
  assert.equal(next.retained,2);assert.equal(reads,2);assert.equal(next.readings[0]!.kind,'ready');
  assert.equal((next.readings[0] as any).identity,(first.readings[0] as any).identity);
  const quiet=readingClosures(options);assert.equal(quiet.opened,0);assert.equal(reads,2);
  const carrier=join(options.store,'cas/carried',(first.readings[0] as any).identity.split(':')[1]);const kept=readFileSync(carrier);writeFileSync(carrier,'altered retained context');const corrupt=prepare();assert.equal(corrupt.kind,'refuse');if(corrupt.kind==='refuse')assert.equal(corrupt.code,'reading-identity/integrity');assert.equal(reads,2,'inspection cannot repair a corrupt receipt by executing the final reader');writeFileSync(carrier,kept);
  writeFileSync(join(root,'maintenance'),'ignored');assert.deepEqual(prepare(),next,'undeclared maintenance does not enter the identity');
  const changed=prepare({context:{...options.context,inputs:[['transitive',hash('other dependency')]]},execution:undefined});assert.equal(changed.kind,'refuse','unknown execution boundary cannot claim an identity');
  const alteredExecution=readingExecution({instrument:hash('instrument'),implementation:capsule.digest,policy:hash('policy'),inputs:[['transitive',hash('other dependency')]]},hash,{env:{},cwd:root,flags:[]});
  const altered=prepare({context:alteredExecution.context,execution:alteredExecution});assert.equal(altered.kind,'fact');if(altered.kind==='fact'){assert.notEqual((altered.readings[0] as any).identity,(first.readings[0] as any).identity);assert.equal(altered.retained,0);}
  const controller=new AbortController();controller.abort();const before=probes;
  assert.deepEqual(prepare({preparationLimits:{...preparationLimits,signal:controller.signal}}),{kind:'refuse',code:'host/cancelled',diagnostic:'REFUSE·host/cancelled'});assert.equal(probes,before);
  assert.equal(prepare({preparationLimits:{...preparationLimits,bytes:1}}).kind,'refuse');assert.equal(probes,before);
  writeFileSync(join(root,'input.txt'),'altered');const wrong=prepare();assert.equal(wrong.kind,'refuse');if(wrong.kind==='refuse')assert.equal(wrong.code,'reading-identity/integrity');assert.equal(probes,before);
  rmSync(join(root,'input.txt'));assert.deepEqual(prepare(),{kind:'needs',needs:['input.txt']});
 }finally{rmSync(root,{recursive:true,force:true});}
});
