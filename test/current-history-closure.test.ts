import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {canonical,parse} from '@lapxo/topos/wire';
import {readingIdentityBytes} from '@lapxo/topos/contract';
import {fullDigest} from '../src/host/digest.ts';
import {readingEnvironment} from '../src/host/reading-context.ts';
import {childFlags} from '../src/host/capsule.ts';
import {portableReadingReceipt} from '../src/host/reading-closures.ts';
import {fileRegionDigest,instrumentKeep,meets} from '../src/fold/closed.ts';
import {bytesOnly} from '../src/fold/resolved.ts';
import {keepFold,keptPlace} from '../src/fold/kept.ts';
import {land,landShard} from '../src/land/ledger.ts';
import type {PlaceFold} from '../src/cli/place.ts';
import {foldPlace,standingOf} from '../src/cli/place.ts';
import {actingRootFixture} from './support/acting-root.ts';

const hash=(text:string)=>fullDigest(text,'sha256');
const config=(scope:string,value:string)=>canonical({scope,value,role:'writes',form:'alphabet',measure:'id',by:'target',at:'policy:fixture'});
function fixture(){
 const formed=actingRootFixture('current-history',[],{extraBootstrapRows:[config('wire/reading-context','reading-context@1'),config('wire/reading-receipt','reading-receipt@1')]});
 const {root}=formed,store=join(root,'.bound');
 writeFileSync(join(root,'input.txt'),'current input');
 const environment=readingEnvironment(hash,process.env,root,childFlags());
 const receipt=(name:string,env=environment)=>{
  const context={instrument:hash('instrument'),implementation:hash('implementation'),policy:hash('policy'),inputs:[['file',hash('current input')]] as const,environment:env};
  return portableReadingReceipt('receipts/readings/'+name,'observer',new TextDecoder().decode(readingIdentityBytes(context)),'',hash);
 };
 const active=receipt('active'),history=receipt('history',[['retired-environment',hash('old boundary')]]);
 const seal=(carrier:readonly string[])=>{
  const value=fileRegionDigest(root,'','receipts/.','sha256',carrier);
  writeFileSync(join(root,'receipts.bound'),[...carrier,canonical({scope:'receipts/.',role:'writes',form:'alphabet',measure:'bytes',value,by:'bound',at:'place:'+value})].join('\n')+'\n');
 };
 const dispose=formed.close;
 return {root,store,active,history,receipt,seal,dispose};
}

test('current closure retains authentic history from another execution boundary',()=>{
 const f=fixture();try{
  f.seal([...f.active,...f.history]);
  assert.equal(meets(f.root,f.store,'',true,f.active),true);
  assert.equal(meets(f.root,f.store,'',false),true,'historical inspection still verifies every carrier');
  assert.equal(meets(f.root,f.store,'',true),false,'a cold process has no trusted active snapshot');
 }finally{f.dispose();}
});

test('historical carrier corruption still refuses when current evidence is valid',()=>{
 const f=fixture();try{
  const broken=f.history.map(line=>{const got=parse(line);if(got.kind!=='fact')throw Error('invalid fixture');const fields=got.value.fields;return fields.measure==='bytes'?canonical({...fields,about:' '+fields.about}):line;});
  assert.notDeepEqual(broken,f.history);
  f.seal([...f.active,...broken]);
  assert.equal(meets(f.root,f.store,'',true,f.active),false);
 }finally{f.dispose();}
});

test('active receipts from a stale environment do not close the current place',()=>{
 const f=fixture();try{
  f.seal([...f.active,...f.history]);
  assert.equal(meets(f.root,f.store,'',true,f.history),false);
 }finally{f.dispose();}
});

test('an active unit must occur completely in the shipped carrier',()=>{
 const f=fixture();try{
  f.seal(f.history);
  assert.equal(meets(f.root,f.store,'',true,f.active),false);
  f.seal([...f.history,...f.active.slice(1)]);
  assert.equal(meets(f.root,f.store,'',true,f.active),false);
 }finally{f.dispose();}
});

test('published observed markers retain active membership under the existing bytesOnly projection',()=>{
 const f=fixture();try{
  const published=f.active.map(bytesOnly);
  assert.notDeepEqual(published,f.active,'the public marker shortens the full digest');
  f.seal([...published,...f.history.map(bytesOnly)]);
  assert.equal(meets(f.root,f.store,'',true,f.active),true,'the complete active unit matches its existing public projection');
  const changed=published.map(line=>{const got=parse(line);if(got.kind!=='fact')throw Error('invalid fixture');const fields=got.value.fields;return fields.measure==='observed'?canonical({...fields,value:'0'.repeat(16)}):line;});
  f.seal([...changed,...f.history.map(bytesOnly)]);
  assert.equal(meets(f.root,f.store,'',true,f.active),false,'a different public marker is not the same active unit');
  f.seal(published.filter(line=>!line.includes('measure=observed ')));
  assert.equal(meets(f.root,f.store,'',true,f.active),false,'the public marker cannot be omitted');
 }finally{f.dispose();}
});

test('a previously closed carrier cannot cache a new fold whose active units are not published',()=>{
 const f=fixture();try{
  writeFileSync(join(f.root,'entry.js'),'export const fixture = true;\n');
  f.seal([...f.active,...f.history]);
  const standing=standingOf(f.root);
  const first=foldPlace(f.root,'entry.js',undefined,false,{standing,observed:f.active,free:true});
  instrumentKeep(f.store,first.instrument);
  assert.equal(meets(f.root,f.store,''),true,'the original active fold is closed');
  assert.deepEqual(keptPlace(f.store,undefined,first.instrument)?.observed,first.observed);
  const next=f.receipt('unpublished');
  const attempted=foldPlace(f.root,'entry.js',undefined,false,{standing,observed:next,free:true});
  assert.notDeepEqual(attempted.observed,first.observed);
  assert.deepEqual(keptPlace(f.store,undefined,first.instrument)?.observed,first.observed,'old closure cannot authorize keeping different unpaid active units');
 }finally{f.dispose();}
});

test('a changed consumed input invalidates current file closure',()=>{
 const f=fixture();try{
  f.seal([...f.active,...f.history]);
  assert.equal(meets(f.root,f.store,'',true,f.active),true);
  writeFileSync(join(f.root,'input.txt'),'changed input');
  assert.equal(meets(f.root,f.store,'',true,f.active),false);
 }finally{f.dispose();}
});

for(const scope of ['policy/reading','keys/observer/coverage'])test(`a changed ${scope} invalidates the public standing seal`,()=>{
 const f=fixture();try{
  const original=readFileSync(join(f.root,'TARGET.bound'),'utf8');
  writeFileSync(join(f.root,'TARGET.bound'),original+config(scope,'original')+'\n');
  f.seal([...f.active,...f.history]);assert.equal(meets(f.root,f.store,'',true,f.active),true);
  writeFileSync(join(f.root,'TARGET.bound'),original+config(scope,'changed')+'\n');
  assert.equal(meets(f.root,f.store,'',true,f.active),false);
 }finally{f.dispose();}
});

test('a private current snapshot remains bound to instrument, reader history and relevant judgments',()=>{
 const f=fixture();try{
  const demand=canonical({scope:'contract/current',role:'demands',form:'interval',measure:'count',value:'0..0',by:'device',at:'policy:fixture'});
  const fold={instrument:'current',standing:[demand],observed:f.active,grey:[],refused:[],demands:[demand],paid:[],missing:[demand],history:[],orphans:[],signed:new Map(),claims:1} as unknown as PlaceFold;
  let sequence=0;
  const keep=()=>keepFold(f.store,'snapshot-'+(++sequence),fold,['place .']);
  keep();assert.ok(keptPlace(f.store,undefined,'current'));
  assert.equal(keptPlace(f.store,undefined,'other-instrument'),undefined);
  landShard(f.store,'reader','reading',[canonical({scope:'reading/new',role:'reads',form:'interval',measure:'count',value:'0..0',by:'reader',at:'place:new'})]);
  assert.equal(keptPlace(f.store,undefined,'current'),undefined);
  keep();assert.ok(keptPlace(f.store,undefined,'current'));
  land(f.store,'judge',[canonical({scope:'contract/current',role:'writes',form:'alphabet',measure:'status',value:'met',by:'judge',at:'receipt:fixture'})]);
  assert.equal(keptPlace(f.store,undefined,'current'),undefined);
 }finally{f.dispose();}
});
