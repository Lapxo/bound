import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonical} from '@lapxo/topos/wire';
import {actingRootFixture} from './support/acting-root.ts';
import {nativeHostInstrument,prepareNativeViewIdentity,prepareNativeViewIdentities} from '@lapxo/bound/host';
import {captureViewInputs,viewInput,withViewInputObservation} from '../dist/host/reading-context.js';
import {sha256} from '../dist/host/hash.js';
import {underTheLock} from '../dist/land/act.js';
import {storeOf} from '../dist/land/ledger.js';

const caseYes=JSON.parse(readFileSync(new URL('../samples/native-view-batch/yes.json',import.meta.url),'utf8'));
const caseNo=JSON.parse(readFileSync(new URL('../samples/native-view-batch/no.json',import.meta.url),'utf8'));
const entry=process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname;
const instrument=nativeHostInstrument(resolve(entry,'../../..'),entry);
const row=(scope:string,measure:string,value:string,form='alphabet',role='writes')=>canonical({scope,measure,value,form,role,by:'target',at:'policy:fixture'});
const views=caseYes.views as string[];
const extra=[...views.map(view=>row('view/'+view,'id',view+'@8','alphabet','demands')),...Object.entries({bytes:16777216,files:2048,readings:16,probes:1}).map(([key,value])=>row('reading-identity/'+key,key,'0..'+value,'interval'))];
const families='keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reading-identity';
for(const name of caseYes.places as string[])test('batch identity and text share the native snapshot: '+name,async()=>{
 const f=actingRootFixture(name,[],{entry,families,extraBootstrapRows:extra});
 const query=()=>prepareNativeViewIdentities({place:f.root,instrument,views});
 try{
  const snapshot=(at:string):unknown=>readdirSync(at,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).map(item=>[item.name,item.isDirectory()?snapshot(join(at,item.name)):sha256(readFileSync(join(at,item.name)))]);
  const nativeTexts=new Map(views.map(view=>{const r=f.run(['fold','--as',view]);assert.equal(r.status,0,r.stderr);return [view,r.stdout]}));const before=snapshot(f.root),batch=query();assert.equal(batch.kind,'fact',JSON.stringify(batch));if(batch.kind!=='fact')return;
  for(const result of batch.views){assert.deepEqual(result,prepareNativeViewIdentity({place:f.root,instrument,view:result.view}));assert.equal(result.text,nativeTexts.get(result.view));}
  const reversed=prepareNativeViewIdentities({place:f.root,instrument,views:[...views].reverse()});assert.equal(reversed.kind,'fact');if(reversed.kind==='fact')assert.deepEqual(reversed.views,[...batch.views].reverse());
  const cli=f.run(['fold','--as','reading-identities@lines+evidence']);assert.equal(cli.status,0,cli.stderr);const cliBatch=JSON.parse(cli.stdout);assert.equal(cliBatch.kind,'fact');assert.deepEqual(cliBatch.views.map((v:{view:string;text:string})=>({view:v.view,text:v.text})),batch.views.map(v=>({view:v.view,text:v.text})));const repeated=f.run(['fold','--as','reading-identities@lines+evidence']);assert.equal(repeated.status,0,repeated.stderr);assert.deepEqual(JSON.parse(repeated.stdout),cliBatch);
  const expectedIdentities=Object.fromEntries(batch.views.map(v=>[v.view,v.identity]));assert.deepEqual(prepareNativeViewIdentities({place:f.root,instrument,views,expectedIdentities}),batch);
  const stale=prepareNativeViewIdentities({place:f.root,instrument,views,expectedIdentities:{...expectedIdentities,evidence:caseNo.staleDigest}});assert.equal(stale.kind,'refuse');assert.equal('views' in stale,false);
  for(const selection of caseNo.selections as string[][]){const bad=prepareNativeViewIdentities({place:f.root,instrument,views:selection});assert.equal(bad.kind,'refuse');assert.equal('views' in bad,false);}
  const badCli=f.run(['fold','--as','reading-identities@lines+unknown']);assert.notEqual(badCli.status,0);assert.equal(badCli.stdout,'');
  await underTheLock(storeOf(f.root),'native batch read during writer exclusion',async()=>{assert.deepEqual(query(),batch);const r=f.run(['fold','--as','reading-identities@lines+evidence']);assert.equal(r.status,0,r.stderr);assert.doesNotMatch(r.stderr,/WAIT/);});
  assert.deepEqual(snapshot(f.root),before,'batch preserves every persisted byte after ordinary-view initialization');
  const lot=join(f.temp,'evidence.bound');writeFileSync(lot,row('sample/new-observation','id','new')+'\n');const landed=f.run(['land',lot,'--key','owner','--key-file',f.key]);assert.equal(landed.status,0,landed.stderr);const changed=query();assert.equal(changed.kind,'fact');if(changed.kind==='fact')for(let i=0;i<views.length;i++)assert.notEqual(changed.views[i]!.identity,batch.views[i]!.identity);
 }finally{f.close()}
});
test('scoped shared capture rereads sources once and refuses mutation before return',()=>{
 let reads=0,source='stable';const run=()=>captureViewInputs({bytes:4096,files:4},()=>viewInput('shared',()=>{reads++;return source}));
 const first=withViewInputObservation(()=>[run(),run()]);assert.deepEqual(first[0],first[1]);assert.equal(reads,2,'one consumed read and one fresh verification');
 source='changed';const next=withViewInputObservation(run);assert.notDeepEqual(next.inputs,first[0]!.inputs,'no cross-call cache');
 assert.throws(()=>withViewInputObservation(()=>{run();source='mutated';return run()}),/reading-identity\/context/);
 assert.throws(()=>withViewInputObservation(async()=>run()),/must be synchronous/);
 assert.throws(()=>withViewInputObservation(()=>captureViewInputs({bytes:1,files:4},()=>viewInput('shared',()=>source))),/reading-identity\/budget/);
});
