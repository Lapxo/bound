import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical,parse,PROTOCOL} from '@lapxo/topos/wire';
import {fullDigest} from '../src/host/digest.ts';
import {readingClosures,verifiedReadingReceipts} from '../src/host/reading-closures.ts';
import type {Capsule} from '../src/host/capsule.ts';
import type {ReadingIdentityContext} from '@lapxo/topos/contract';
import {fileRegionDigest} from '../src/fold/closed.ts';
import {placedReadings} from '../src/fold/observed.ts';
import {receiptsOf,keepCarried,carriedFrom} from '../src/fold/resolved.ts';
import type {PlaceFold} from '../src/cli/place.ts';

const hash=(text:string)=>fullDigest(text,'sha256');
const plan=(scope:string,value:string,needs='')=>canonical({scope,value,needs,role:'reads',form:'alphabet',measure:'reads',at:'receipt:1'});
test('input witnesses preserve one result origin, even when a reading name is also an input coordinate',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-input-attribution-'));
 try{
  for(const name of ['left.txt','right.txt'])writeFileSync(join(root,name),name);
  const capsule={digest:hash('joint provider'),lines:[],declaration:{regions:{}},ask:(requests:any[])=>requests.map(req=>req.verb==='render'
   ?{protocol:PROTOCOL,kind:'fact',lines:[plan('left.txt','left.txt|right.txt')]}
   :{protocol:PROTOCOL,kind:'fact',claims:[{scope:'concept/joint',role:'reads',measure:'count',bound:{kind:'interval',lo:1,hi:1}}]})} as Capsule;
  const got=readingClosures({root,store:join(root,'.bound'),reader:'joint',speaker:'reader',digest:hash,capsule,region:'reading',projection:'inputs',files:['left.txt','right.txt'].map(place=>({place,text:readFileSync(join(root,place),'utf8')}))});
  const results=placedReadings(got.lines).filter(one=>one.question==='concept/joint');
  assert.equal(results.length,1);assert.equal(results[0]!.place,'left.txt');
  const stamps=got.lines.map(line=>parse(line).value.fields).filter(f=>f.measure==='observed'&&f.scope==='left.txt');
  assert.equal(stamps.filter(f=>f.at.startsWith('place:')).length,1);
  assert.equal(stamps.filter(f=>f.at.startsWith('witness:')).length,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('portable seals retain physical handed inputs when a reading only reports descriptive results',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-handed-inputs-'));
 try{
  mkdirSync(join(root,'foreign'));
  writeFileSync(join(root,'TARGET.bound'),canonical({scope:'coordinate-role/foreign',role:'writes',form:'alphabet',measure:'role',value:'foreign'})+'\n');
  for(const file of ['left','right'])writeFileSync(join(root,'foreign',file+'.txt'),file);
  const capsule={digest:hash('handed provider'),lines:[],declaration:{regions:{}},ask:(requests:any[])=>requests.map(req=>req.verb==='render'
   ?{protocol:PROTOCOL,kind:'fact',lines:[plan('logical/left','foreign/left.txt'),plan('logical/right','foreign/right.txt')]}
   :{protocol:PROTOCOL,kind:'fact',claims:[{scope:'result/'+req.rootScope,role:'reads',measure:'status',bound:{kind:'enumerated',values:['met']}}]})} as Capsule;
  const context:ReadingIdentityContext={instrument:hash('instrument'),implementation:capsule.digest,policy:hash('policy'),inputs:[],environment:[['declared',hash('environment')]]};
  const read=()=>readingClosures({root,store:join(root,'.bound'),reader:'physical',speaker:'reader',digest:hash,capsule,region:'reading',projection:'inputs',context,files:['foreign/left.txt','foreign/right.txt'].map(place=>({place,text:readFileSync(join(root,place),'utf8')}))});
  const first=read();assert.equal(first.executed,2);
  const observed=first.lines.map(line=>parse(line).value.fields).filter(f=>f.measure==='observed'&&f.scope.startsWith('foreign/'));
  assert.deepEqual(observed.map(f=>[f.scope,f.value]),[['foreign/left.txt',hash('left')],['foreign/right.txt',hash('right')]]);
  const publicLines=receiptsOf({root,store:join(root,'.bound'),standing:[],observed:first.lines,paid:[]} as unknown as PlaceFold);
  assert.equal(publicLines.filter(line=>{const f=parse(line).value.fields;return f.measure==='observed'&&f.at.startsWith('witness:');}).length,2);
  const carrier=keepCarried(join(root,'.bound'),publicLines);
  const wrapper=canonical({scope:'receipts',role:'writes',form:'alphabet',measure:'digest',value:hash('summary'),at:'place:'+carrier,by:'bound'});
  const copied=carriedFrom(join(root,'no-store'),[...publicLines,wrapper]);assert.ok(copied);
  assert.equal(verifiedReadingReceipts(join(root,'no-store'),copied,hash,undefined,true),2);
  assert.equal(placedReadings(copied).filter(one=>one.question==='result/logical/left').length,1);
  const seal=(region:string,lines:readonly string[])=>fileRegionDigest(root,'',region,'sha256',lines);
  const before=seal('receipts/.',copied),right=seal('receipts/foreign/right.txt',copied),withoutInputs=seal('receipts/.',[]);
  assert.deepEqual(read().lines,first.lines);assert.equal(read().executed,0);
  writeFileSync(join(root,'foreign/left.txt'),'changed');
  assert.notEqual(seal('receipts/.',copied),before,'an authentic public carrier does not hide changed physical input bytes');
  assert.equal(seal('receipts/foreign/right.txt',copied),right);
  assert.equal(seal('receipts/.',[]),withoutInputs,'foreign files matter because they were handed, not because the directory was reclassified');
  const changed=read();assert.equal(changed.executed,1);assert.equal(changed.opened,1);
  assert.equal(read().executed,0);
  writeFileSync(join(root,'foreign/left.txt'),'left');assert.equal(seal('receipts/.',copied),before);
  assert.equal(read().executed,0,'restoring bytes reuses the retained receipt; none were removed');
 }finally{rmSync(root,{recursive:true,force:true});}
});
for(const topology of ['chain','diamond'])test('descent keeps its input base and verifies transitive dependents: '+topology,()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-descent-'));
 try{
  writeFileSync(join(root,'left.txt'),'left');writeFileSync(join(root,'right.txt'),'right');
  const projected=[plan('left','left.txt'),plan('right','right.txt'),...(topology==='chain'?[plan('middle','','left'),plan('join','','middle|right')]:[plan('upper','','left'),plan('lower','','left'),plan('join','','upper|lower|right')])];
  let projection=projected;const invoked:string[]=[];
  const capsule={digest:hash('descent provider'),lines:[],declaration:{regions:{}},ask:(requests:any[])=>requests.map(req=>{
   if(req.verb==='render')return {protocol:PROTOCOL,kind:'fact',lines:projection};
   invoked.push(req.rootScope);
   // Equal descriptive values cannot erase different input or dependency identities.
   return {protocol:PROTOCOL,kind:'fact',claims:[{scope:'result/'+req.rootScope,role:'reads',measure:'status',bound:{kind:'enumerated',values:['met']}}]};
  })} as Capsule;
  const context:ReadingIdentityContext={instrument:hash('instrument'),implementation:capsule.digest,policy:hash('policy'),inputs:[],environment:[['declared',hash('environment')]]};
  const read=()=>readingClosures({root,store:join(root,'.bound'),reader:topology,speaker:'reader',digest:hash,capsule,region:'reading',projection:'inputs',context,files:['left.txt','right.txt'].map(place=>({place,text:readFileSync(join(root,place),'utf8')}))});
  const bases=(lines:readonly string[])=>new Map(lines.flatMap(line=>{const f=parse(line).value.fields;return f.measure==='observed'&&projected.some(p=>parse(p).value.fields.scope===f.scope)?[[f.scope,f.value] as const]:[];}));
  const first=read(),before=bases(first.lines);assert.equal(first.executed,projected.length);assert.equal(verifiedReadingReceipts(join(root,'without-store'),first.lines,hash,undefined,true),projected.length);
  invoked.length=0;const quiet=read();assert.equal(quiet.executed,0);assert.equal(quiet.opened,0);assert.deepEqual(quiet.lines,first.lines);
  writeFileSync(join(root,'left.txt'),'changed');const changed=read(),after=bases(changed.lines);
  assert.deepEqual(invoked,topology==='chain'?['left','middle','join']:['left','upper','lower','join']);assert.equal(changed.opened,invoked.length);
  assert.equal(after.get('right'),before.get('right'),'an untouched sibling retains its own input base');
  for(const name of invoked)assert.notEqual(after.get(name),before.get(name),'every dependent commits the changed upstream receipt: '+name);
  invoked.length=0;assert.equal(read().opened,0);assert.deepEqual(invoked,[]);
  const held=bases(read().lines);projection=[plan('left','left.txt','join'),...projected.slice(1)];
  assert.throws(read,/dependency cycle/);assert.deepEqual(invoked,[],'a cycle refuses before running any reading');
  projection=[...projected,plan('missing','','not-declared')];assert.throws(read,/missing reading not-declared/);assert.deepEqual(invoked,[]);
  projection=projected;assert.deepEqual(bases(read().lines),held,'refused projections cannot replace paid descent bases');
 }finally{rmSync(root,{recursive:true,force:true});}
});
