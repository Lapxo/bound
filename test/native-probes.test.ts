import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {canonical} from '@lapxo/topos/wire';
import {actingRootFixture} from './support/acting-root.ts';
import {nativeHostInstrument,prepareNativeViewIdentity} from '@lapxo/bound/host';
import {prepareNativeProbe} from '../src/host/native/probes.ts';
import {sha256} from '../src/host/hash.ts';

const caseYes=JSON.parse(readFileSync(new URL('../samples/native-probes/yes.json',import.meta.url),'utf8'));
const caseNo=JSON.parse(readFileSync(new URL('../samples/native-probes/no.json',import.meta.url),'utf8'));

const entry=process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname;
const instrument=nativeHostInstrument(resolve(entry,'../../..'),entry);
const row=(scope:string,measure:string,value:string,form='alphabet',role='writes')=>canonical({scope,measure,value,form,role,by:'target',at:'policy:fixture'});
const witness=caseYes;
const bootstrap=[row('view/lines','id','lines@8','alphabet','demands'),row('view/evidence','id','evidence@8','alphabet','demands'),...Object.entries(witness.declaredIdentityLimits).map(([key,n])=>row('reading-identity/'+key,key,'0..'+n,'interval'))];
const families='keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reading-identity';
const captures:unknown[]=[];
for(const name of witness.places as string[])test('public probe is bounded and has zero persistent growth: '+name,()=>{
 const fixture=actingRootFixture(name,[],{entry,families,extraBootstrapRows:bootstrap});
 try{
  const inventory=(root:string):{path:string;bytes:number;lines:number;digest:string}[]=>readdirSync(root,{withFileTypes:true}).flatMap(e=>{const path=join(root,e.name);if(e.isDirectory())return inventory(path);const bytes=readFileSync(path);return [{path:path.slice(fixture.root.length+1),bytes:bytes.length,lines:bytes.toString('utf8').split('\n').length-1,digest:sha256(bytes)}]}).sort((a,b)=>a.path.localeCompare(b.path));
  const before=inventory(fixture.root),counter={used:new Map<string,number>()};
  const port={...witness.port};
  const context={place:fixture.root,instrument,view:'lines',port,counter};
  const native=new Map(['lines','evidence'].map(view=>{const r=prepareNativeViewIdentity({...context,view});assert.equal(r.kind,'fact',JSON.stringify(r));return [view,r]}));
  const folds=new Map(['lines','evidence'].map(view=>{const r=fixture.run(['fold','--as',view]);assert.equal(r.status,0,r.stderr);return [view,r.stdout]}));
  const afterOrdinary=inventory(fixture.root);
  const nativeCLI=new Map<string,string>();
  for(const view of ['lines','evidence']){
   const first=fixture.run(['fold','--as','probe@'+view]);assert.equal(first.status,0,first.stderr);
   const result=JSON.parse(first.stdout);assert.equal(result.kind,'fact');assert.equal(result.form,view);assert.equal(result.probes,1);assert.equal(result.text,folds.get(view));
   nativeCLI.set(view,result.identity);
   const again=fixture.run(['fold','--as','probe@'+view]);assert.equal(again.status,0,again.stderr);assert.deepEqual(JSON.parse(again.stdout),result);
  }
  const unsupportedCLI=fixture.run(['fold','--as','probe@unknown']);assert.notEqual(unsupportedCLI.status,0);assert.equal(unsupportedCLI.stdout,'');assert.match(unsupportedCLI.stderr,/reading-identity\/selection/);
  assert.deepEqual(inventory(fixture.root),afterOrdinary,'CLI probes preserve every persisted file');


  for(let i=0;i<witness.repetitions;i++){
   const view=i%2?'evidence':'lines',result=prepareNativeProbe({...context,view});assert.equal(result.kind,'fact',JSON.stringify(result));
   if(result.kind==='fact'){const expected=native.get(view)!;assert.equal(expected.kind,'fact');if(expected.kind==='fact'){assert.equal(result.identity,expected.identity);assert.equal(result.text,expected.text)}assert.equal(result.text,folds.get(view));assert.equal(result.probes,1)}
   assert.equal(counter.used.get(port.coordinate),i+1);assert.deepEqual(inventory(fixture.root),afterOrdinary);
  }
  const refusal=(result:ReturnType<typeof prepareNativeProbe>,code:string)=>{assert.equal(result.kind,'refuse',JSON.stringify(result));if(result.kind==='refuse')assert.equal(result.code,code)};
  refusal(prepareNativeProbe({...context,port:{...port,coordinate:caseNo.invalidPort}}),'host/context');
  refusal(prepareNativeProbe(context),'host/budget');assert.equal(counter.used.get(port.coordinate),6);
  const separate={...context,port:{...port,coordinate:'port/another-inspection'}};assert.equal(prepareNativeProbe(separate).kind,'fact');assert.equal(counter.used.get(port.coordinate),6);assert.equal(counter.used.get(separate.port.coordinate),1);
  refusal(prepareNativeProbe({...separate,view:caseNo.unsupportedView}),'reading-identity/selection');assert.equal(counter.used.get(separate.port.coordinate),1);
  const controller=new AbortController();controller.abort();refusal(prepareNativeProbe({...separate,signal:controller.signal}),'host/cancelled');assert.equal(counter.used.get(separate.port.coordinate),1);
  refusal(prepareNativeProbe({...separate,port:{...port,coordinate:'port/tiny-response',responseBytes:caseNo.responseBytes}}),'host/budget');assert.equal(counter.used.get('port/tiny-response'),1);
  refusal(prepareNativeProbe({...separate,expectedIdentity:caseNo.expectedIdentity}),'reading-identity/context');
  const capped={...context,port:{...port,coordinate:'port/admitted-cap',probes:caseNo.askedProbes}};for(let i=0;i<8;i++)assert.equal(prepareNativeProbe(capped).kind,'fact');refusal(prepareNativeProbe(capped),'host/budget');assert.equal(counter.used.get(capped.port.coordinate),8);
  // A signal can change while synchronous capture runs; the return check must
  // discard its result. No event-loop timer is needed to prove this boundary.
  let reads=0;const during={get aborted(){return ++reads>1}} as AbortSignal;
  refusal(prepareNativeProbe({...separate,signal:during}),'host/cancelled');
  assert.deepEqual(inventory(fixture.root),afterOrdinary);
  for(const view of ['lines','evidence'])assert.deepEqual(prepareNativeViewIdentity({...context,view}),native.get(view));
  captures.push({place:name,forms:['lines','evidence'],probes:6,filesBefore:afterOrdinary.length,filesAfter:inventory(fixture.root).length,bytesBefore:afterOrdinary.reduce((n,f)=>n+f.bytes,0),bytesAfter:inventory(fixture.root).reduce((n,f)=>n+f.bytes,0),linesBefore:afterOrdinary.reduce((n,f)=>n+f.lines,0),linesAfter:inventory(fixture.root).reduce((n,f)=>n+f.lines,0),persistentNewBytes:0,persistentNewLines:0,ordinaryViewChangedInventory:JSON.stringify(before)!==JSON.stringify(afterOrdinary),counters:Object.fromEntries(counter.used),identities:Object.fromEntries([...native].map(([view,r])=>[view,r.kind==='fact'?r.identity:r])),refusals:['unsupported','exhausted','admitted-cap','cancelled-before','cancelled-after','response-bytes','stale-identity']});
 }finally{fixture.close()}
});
process.on('exit',()=>{if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE,JSON.stringify(captures,null,2)+'\n')});
