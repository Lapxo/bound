import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonical} from '@lapxo/topos/wire';
import {actingRootFixture} from './support/acting-root.ts';
import {prepareNativeViewIdentity,nativeHostInstrument} from '@lapxo/bound/host';
import {underTheLock} from '../dist/land/act.js';
import {sha256} from '../dist/host/hash.js';
import {captureViewInputs,viewInput} from '../dist/host/reading-context.js';
import {storeOf} from '../dist/land/ledger.js';

const row=(scope:string,measure:string,value:string,form='alphabet',role='writes',at='policy:fixture')=>canonical({scope,measure,value,form,role,by:'target',at});
const families='keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reading-identity';
const views=[row('view/lines','id','lines@8','alphabet','demands'),row('view/evidence','id','evidence@8','alphabet','demands')];
const budgets=Object.entries({bytes:16777216,files:2048,readings:16,probes:1}).map(([k,n])=>row('reading-identity/'+k,k,'0..'+n,'interval'));
const entry=new URL('../dist/cli/verb.js',import.meta.url).pathname,instrument=nativeHostInstrument(resolve('.'),entry);
test('native view identity: seven vectors, readonly concurrency and two places',async t=>{
 const a=actingRootFixture('editorial-notes',[],{entry,families,extraBootstrapRows:[...views,...budgets]}),b=actingRootFixture('water-level',[],{entry,families,extraBootstrapRows:[...views,...budgets]});
 const query=(f:typeof a,view='lines')=>{const r=f.run(['fold','--as','reading-identity@'+view]);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout) as {identity:string;view:string}};
 const land=(f:typeof a,line:string)=>{const lot=join(f.temp,'lot.bound');writeFileSync(lot,line+'\n');const r=f.run(['land',lot,'--key','owner','--key-file',f.key]);assert.equal(r.status,0,r.stderr)};
 try{
  await t.test('1. stable identity across processes and repeated host calls',()=>{
   for(const f of [a,b])for(const view of ['lines','evidence']){
    assert.equal(query(f,view).identity,query(f,view).identity);
    assert.deepEqual(prepareNativeViewIdentity({place:f.root,instrument,view}),prepareNativeViewIdentity({place:f.root,instrument,view}));
   }
  });
  await t.test('2. admitted evidence changes identity',()=>{for(const f of [a,b]){const before=query(f,'evidence');land(f,row('sample/observation','id','observed','alphabet','writes','witness:fixture'));assert.notEqual(query(f,'evidence').identity,before.identity)}});
  await t.test('3. admitted lock declaration changes identity',()=>{for(const f of [a,b]){const before=query(f);land(f,row('sample/configuration','id','configured'));assert.notEqual(query(f).identity,before.identity)}});
  await t.test('4. fold cache and exclusion bookkeeping do not change identity',()=>{for(const f of [a,b])for(const view of ['lines','evidence']){const before=query(f,view);writeFileSync(join(f.root,'.bound/ledger/fold.bound'),'maintenance cache\n');mkdirSync(join(f.root,'.bound/locks'),{recursive:true});writeFileSync(join(f.root,'.bound/locks','unrelated'),'bookkeeping');assert.equal(query(f,view).identity,before.identity);rmSync(join(f.root,'.bound/locks','unrelated'))}});
  await t.test('5. distinct places have distinct identities',()=>{for(const view of ['lines','evidence'])assert.notEqual(query(a,view).identity,query(b,view).identity)});
  await t.test('6. unsupported views refuse with no identity',()=>{const r=a.run(['fold','--as','reading-identity@rank']);assert.notEqual(r.status,0);assert.equal(r.stdout,'');assert.equal(JSON.parse(r.stderr.trim().split('\n').at(-1)!).code,'reading-identity/selection')});
  await t.test('7. result names consumed identity; stale expected identity returns no output',()=>{
   for(const f of [a,b])for(const view of ['lines','evidence']){
    const before=query(f,view),matched=f.run(['fold','--as','reading-identity@'+view+'@'+before.identity]);assert.equal(matched.status,0,matched.stderr);const held=JSON.parse(matched.stdout);assert.equal(held.identity,before.identity);assert.equal(held.view,view);
    const ordinary=f.run(['fold','--as',view]);assert.equal(ordinary.status,0,ordinary.stderr);assert.equal(held.text,ordinary.stdout);
    land(f,row('sample/after-query/'+view,'id','new'));const stale=f.run(['fold','--as','reading-identity@'+view+'@'+before.identity]);assert.notEqual(stale.status,0);assert.equal(stale.stdout,'');assert.equal(JSON.parse(stale.stderr.trim().split('\n').at(-1)!).code,'reading-identity/context');
   }
  });
  await t.test('no Root lock or writes: native CLI answers while Root writer holds exclusion',async()=>{
   const files=(at:string):unknown=>readdirSync(at,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1).map(e=>[e.name,e.isDirectory()?files(join(at,e.name)):sha256(readFileSync(join(at,e.name)))]);
   const before=JSON.stringify(files(join(a.root,'.bound'))),target=readFileSync(join(a.root,'TARGET.bound'),'utf8');
   await underTheLock(storeOf(a.root),'test Root writer',async()=>{for(const view of ['lines','evidence']){const r=a.run(['fold','--as','reading-identity@'+view]);assert.equal(r.status,0,r.stderr);assert.doesNotMatch(r.stderr,/WAIT/);assert.doesNotMatch(r.stdout,/preparations/);}});
   assert.equal(readFileSync(join(a.root,'TARGET.bound'),'utf8'),target);assert.equal(JSON.stringify(files(join(a.root,'.bound'))),before);
  });
 }finally{a.close();b.close()}
});

test('identity budgets do not become prerequisites of legacy views or landing',()=>{
 const f=actingRootFixture('legacy-without-identity-budgets',[],{entry,extraBootstrapRows:views});
 try{
  for(const view of ['lines','evidence']){const r=f.run(['fold','--as',view]);assert.equal(r.status,0,r.stderr)}
  const lot=join(f.temp,'legacy.bound');writeFileSync(lot,row('sample/legacy','id','still-admitted')+'\n');assert.equal(f.run(['land',lot,'--key','owner','--key-file',f.key]).status,0);
  const missing=f.run(['fold','--as','reading-identity@lines']);assert.notEqual(missing.status,0);assert.match(missing.stderr,/reading-identity\/budget/);assert.equal(missing.stdout,'');
 }finally{f.close()}
});

test('view preparation refuses changed sources and frames field boundaries',()=>{
 let source='before';
 assert.throws(()=>captureViewInputs({bytes:4096,files:4},()=>{const first=viewInput('selected',()=>source);source='after';assert.equal(viewInput('selected',()=>source),first);return first}),/reading-identity\/context/);
 const first=captureViewInputs({bytes:4096,files:4},()=>viewInput('input.txt',()=> 'bc'));
 const second=captureViewInputs({bytes:4096,files:4},()=>viewInput('input.txtb',()=> 'c'));
 assert.notDeepEqual(first.inputs,second.inputs);
 assert.throws(()=>captureViewInputs({bytes:1,files:1},()=>viewInput('selected',()=> 'too large')),/reading-identity\/budget/);
});
