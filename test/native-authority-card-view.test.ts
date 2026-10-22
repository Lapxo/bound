import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonical} from '@lapxo/topos/wire';
import {actingRootFixture} from './support/acting-root.ts';
import {sha256} from '../src/host/hash.ts';
import {nativeHostInstrument,nativeAuthorityCardView} from '@lapxo/bound/host';
const entry=process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname;
const instrument=nativeHostInstrument(resolve(entry,'../../..'),entry);
const row=(scope:string,measure:string,value:string,form='alphabet')=>canonical({scope,measure,value,form,role:'writes',by:'target',at:'policy:fixture'});
for(const place of ['ledger-notes','tide-register'])test('authority view selects exact admitted bounded request bytes: '+place,async()=>{
 const scope='sample/authority-query',record=row('sample/inspect','id','present');
 const request={profile:'native-authority-card-request/1',place:'.',key:'owner',authorityEpoch:1,clock:{name:'inspection-clock',unit:'tick',now:10},horizon:{clock:'inspection-clock',unit:'tick',from:0,through:20},limits:{bytes:262144,items:4096},actions:[{kind:'record-coverage',records:[record]}]};
 const text=JSON.stringify(request)+'\n',digest=sha256(text),unknown=sha256('a different, unavailable request');
 const extra=[row(scope,'authority-card-request',digest),row(scope+'/bytes','bytes','0..262144','interval'),row(scope+'/items','items','0..4096','interval'),row('sample/missing-query','authority-card-request',unknown),row('sample/missing-query/bytes','bytes','0..262144','interval'),row('sample/missing-query/items','items','0..4096','interval'),row('sample/bad-budget','authority-card-request',digest),row('sample/bad-budget/bytes','bytes','1..262144','interval'),row('sample/bad-budget/items','items','0..4096','interval')];
 const f=actingRootFixture(place,[],{entry,extraBootstrapRows:extra});
 try{
  const cas=join(f.root,'.bound/cas/blobs');mkdirSync(cas,{recursive:true});const file=join(cas,digest.slice(7));writeFileSync(file,text);
  const result=await nativeAuthorityCardView(f.root,instrument,scope);assert.equal(result.kind,'fact',JSON.stringify(result));if(result.kind!=='fact')return;
  assert.equal(result.value.judgments[0]!.decision,'allow');
  assert.equal(result.value.card.catalog,sha256(readFileSync(new URL('../docs/contracts/refusals.bound',import.meta.url))));
  assert.equal(result.value.card.standingContract,sha256(readFileSync(new URL('../docs/contracts/standing.bound',import.meta.url))));
  const cli=f.run(['fold','--as','authority-card@'+scope]);assert.equal(cli.status,0,cli.stderr);const printed=JSON.parse(cli.stdout);assert.equal(printed.kind,'fact');assert.equal(printed.value.judgments[0].decision,'allow');
  await assert.rejects(()=>nativeAuthorityCardView(f.root,instrument,'sample/not-selected'),e=>(e as {code?:string}).code==='authority-card/selection');
  await assert.rejects(()=>nativeAuthorityCardView(f.root,instrument,'sample/bad-budget'),e=>(e as {code?:string}).code==='authority-card/budget');
  await assert.rejects(()=>nativeAuthorityCardView(f.root,instrument,'sample/missing-query'),e=>(e as {code?:string}).code==='authority-card/content');
  writeFileSync(file,text+'altered');await assert.rejects(()=>nativeAuthorityCardView(f.root,instrument,scope),e=>(e as {code?:string}).code==='authority-card/integrity');
  writeFileSync(file,Buffer.alloc(262145));await assert.rejects(()=>nativeAuthorityCardView(f.root,instrument,scope),e=>(e as {code?:string}).code==='authority-card/content');
  writeFileSync(file,text);
  const badCLI=f.run(['fold','--as','authority-card@sample/not-selected']);assert.notEqual(badCLI.status,0);assert.equal(badCLI.stdout,'');assert.match(badCLI.stderr,/authority-card\/selection/);assert.doesNotMatch(badCLI.stderr,/catalog-invalid/);
  rmSync(file);await assert.rejects(()=>nativeAuthorityCardView(f.root,instrument,scope),e=>(e as {code?:string}).code==='authority-card/content');
 }finally{f.close()}
});
