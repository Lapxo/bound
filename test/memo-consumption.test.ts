import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,statSync,rmSync} from 'node:fs';
import {join,relative} from 'node:path';
import {canonical} from '@lapxo/topos/wire';
import {prepareNativeViewIdentities,nativeHostInstrument} from '@lapxo/bound/host';
import {captureViewInputs,withViewInputObservation} from '../dist/host/reading-context.js';
import {withHostCall} from '../dist/host/call-context.js';
import {withContentStore} from '../dist/host/content-store.js';
import {withoutEffects} from '../dist/host/read-only.js';
import {standingOf} from '../dist/cli/place.js';
import {evidenceLines} from '../dist/render/view.js';
import {storeOf,writerFile} from '../dist/land/ledger.js';
import {sha256} from '../dist/host/hash.js';
import {actingRootFixture} from './support/acting-root.ts';
const vector=JSON.parse(readFileSync(new URL('../vectors/contracts/memo-consumption.json',import.meta.url),'utf8'));
const entry=process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname,instrument=nativeHostInstrument(new URL('../',import.meta.url).pathname,entry);
const row=(scope:string,measure:string,value:string,role='writes',form='alphabet')=>canonical({scope,measure,value,role,form,by:'target',at:'policy:fixture'});
const limits={bytes:16777216,files:2048};const extra=[...['lines','evidence'].map(v=>row('view/'+v,'id',v+'@8','demands')),...Object.entries({...limits,readings:16,probes:1}).map(([k,n])=>row('reading-identity/'+k,k,'0..'+n,'writes','interval'))];
const reports:unknown[]=[];
for(const place of vector.domains as string[])test('memo consumption classification: '+place,()=>{
 const f=actingRootFixture(place,[],{entry,extraBootstrapRows:extra,families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reading-identity'});
 const query=()=>{const got=prepareNativeViewIdentities({place:f.root,instrument,views:['lines','evidence']});assert.equal(got.kind,'fact',JSON.stringify(got));return got};
 const inventory=():{coordinate:string;bytes:number;digest:string}[]=>{const walk=(at:string):any[]=>readdirSync(at,{withFileTypes:true}).flatMap(e=>{const p=join(at,e.name);assert.equal(e.isSymbolicLink(),false,'bounded fixture does not follow external links');return e.isDirectory()?walk(p):[{coordinate:relative(f.root,p),bytes:statSync(p).size,digest:sha256(readFileSync(p))}]});return walk(f.root).sort((a,b)=>a.coordinate<b.coordinate?-1:a.coordinate>b.coordinate?1:0)};
 try{
  const original=query();const memo=join(f.root,'.bound/cas/memo/derived'),blob=join(f.root,'.bound/cas/blobs',sha256(Buffer.alloc(vector.policy.unreferencedBlobBytes,97)).slice(7));mkdirSync(join(f.root,'.bound/cas/memo'),{recursive:true});mkdirSync(join(f.root,'.bound/cas/blobs'),{recursive:true});writeFileSync(memo,'reconstructible fixture memo');writeFileSync(blob,Buffer.alloc(vector.policy.unreferencedBlobBytes,97));assert.deepEqual(query(),original,'unconsumed bytes do not enter these view identities');
  const consumed=withHostCall({instrumentName:instrument.name,runtime:instrument.runtime,output:()=>{}},()=>withoutEffects(()=>withContentStore(storeOf(f.root),()=>withViewInputObservation(()=>['lines','evidence'].map(view=>({view,...captureViewInputs(limits,()=>view==='lines'?standingOf(f.root).standing:evidenceLines(f.root,storeOf(f.root)))}))))));
  const references=new Set(consumed.flatMap(v=>v.inputs.map(([name])=>name))),consumedFiles=new Set<string>();
  for(const name of references){if(name.startsWith('file:')||name.startsWith('anchor:'))consumedFiles.add(name.slice(name.indexOf(':')+1));const prefix='authority-ledger:'+storeOf(f.root)+':';if(name.startsWith(prefix))consumedFiles.add(writerFile(storeOf(f.root),name.slice(prefix.length)))}
  const files=inventory(),rows=files.map(file=>({...file,classification:consumedFiles.has(join(f.root,file.coordinate))?'consumed':'unclassified'}));const anchor=[...references].find(name=>name.startsWith('anchor:'));assert.ok(anchor,'actual native authentication consumes an anchor');assert.ok(rows.some(r=>join(f.root,r.coordinate)===anchor.slice(7)&&r.classification==='consumed'));assert.ok(rows.some(r=>r.coordinate.endsWith('/derived')&&r.classification==='unclassified'));
  const before=inventory();for(let n=0;n<vector.policy.repetitions;n++){assert.deepEqual(query(),original);assert.deepEqual(inventory(),before)}
  rmSync(memo);assert.deepEqual(query(),original,'this declared fixture memo is reconstructible for the two measured views');writeFileSync(memo,'reconstructible fixture memo');
  const lock=anchor.slice(7),lockBytes=readFileSync(lock);rmSync(lock);assert.equal(prepareNativeViewIdentities({place:f.root,instrument,views:['lines','evidence']}).kind,'refuse','missing consumed bytes cannot return retained output');writeFileSync(lock,lockBytes);assert.deepEqual(query(),original);
  const report={place,views:consumed.map(v=>({view:v.view,inputs:v.inputs.map(([name,digest])=>({source:name.startsWith('file:')?'file:'+relative(f.root,name.slice(5)):name.replaceAll(f.root,'<place>'),digest}))})),files:rows,consumedBytes:rows.filter(r=>r.classification==='consumed').reduce((n,r)=>n+r.bytes,0),unclassifiedBytes:rows.filter(r=>r.classification==='unclassified').reduce((n,r)=>n+r.bytes,0),derivedFixture:{coordinate:relative(f.root,memo),basis:'explicit reconstructible fixture plus removal/identity vector; limited to measured views'},repetitions:vector.policy.repetitions,newBytes:0,newFiles:0,evictionImplemented:false};reports.push(report);if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE+'.memo.json',JSON.stringify(reports,null,2)+'\n');console.log('MEMO-CONSUMPTION '+place+' · consumed measured · unknown retained · zero growth · missing input refused');
 }finally{f.close()}
});
