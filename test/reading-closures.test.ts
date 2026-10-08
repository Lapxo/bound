import {fullDigest} from '../src/host/digest.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical,PROTOCOL} from '@lapxo/topos/wire';
import {readingClosures} from '../src/host/reading-closures.ts';
import type {Capsule} from '../src/host/capsule.ts';
for(const name of ['specification','conversion'])test('native input closure: '+name,()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-input-closure-')),store=join(root,'.bound');
 try{
  writeFileSync(join(root,'left.txt'),'left');writeFileSync(join(root,'right.txt'),'right');let run=0;
  const plan=(scope:string,file:string,needs='',at='receipt:1')=>canonical({scope,role:'reads',form:'alphabet',measure:'reads',value:file,...(needs?{needs}:{}),at,by:'world'});
  let projected=[plan('left','left.txt'),plan('right','right.txt'),plan('summary','left.txt','left|right','receipt:0')];
  const capsule={digest:'sha256:'+'1'.repeat(64),declaration:{regions:{}},lines:[],ask:(requests:any[])=>requests.map(req=>{if(req.verb==='render')return {protocol:PROTOCOL,kind:'fact',lines:projected};run++;return {protocol:PROTOCOL,kind:'fact',claims:[{scope:'seen/'+req.rootScope,role:'reads',measure:'status',bound:{kind:'enumerated',values:['met']}}]};})} as Capsule;
  const read=()=>readingClosures({root,store,reader:name,speaker:'reader',digest:text=>fullDigest(text,'sha256'),capsule,region:'reading',projection:'inputs',files:['left.txt','right.txt'].map(place=>({place,text:readFileSync(join(root,place),'utf8')}))});
  const first=read();assert.equal(first.opened,2);assert.equal(run,3);const costs=first.lines.filter(line=>line.includes('measure=s '));assert.equal(costs.length,2);for(const cost of costs){const span=/value=(\d+\.\d+)\.\.(\d+\.\d+)/.exec(cost)!;assert.ok(span);assert.equal(span[1],span[2]);assert.ok(Number(span[1])>=0);}const idle=read();assert.equal(idle.opened,0);assert.equal(run,3);assert.deepEqual(idle.lines.filter(line=>line.includes('measure=s ')),costs,'reuse retains the measured regional cost without measuring a fresh execution');
  writeFileSync(join(root,'left.txt'),'changed');assert.equal(read().opened,1);assert.equal(run,5,'only changed leaf and its dependent reading execute');
  const carried=join(store,'cas','carried');for(const name of readdirSync(carried))writeFileSync(join(carried,name),'corrupt');assert.equal(read().opened,2);assert.equal(run,8,'corrupt authentic carriers recompute');
  const before=run;projected=[plan('left','left.txt','right'),plan('right','right.txt','left')];assert.throws(read,/dependency cycle/);assert.equal(run,before,'cyclic projection refuses before any reading');
  projected=[plan('outside','not-handed')];assert.throws(read,/unhanded/);assert.equal(run,before);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('empty readings follow the declared policy and retain native zero-row receipts',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-empty-closure-'));let calls=0;
 try{
  writeFileSync(join(root,'input.txt'),'input');
  const capsule={digest:'sha256:'+'2'.repeat(64),declaration:{regions:{}},lines:[],ask:(requests:any[])=>requests.map(req=>req.verb==='render'?{protocol:PROTOCOL,kind:'fact',lines:[canonical({scope:'empty',role:'reads',form:'alphabet',measure:'reads',value:'input.txt',at:'receipt:1',by:'world'})]}:(calls++,{protocol:PROTOCOL,kind:'fact',claims:[]}))} as Capsule;
  const read=(allowsEmpty:boolean)=>readingClosures({root,store:join(root,'.bound'),reader:'reader',speaker:'reader',digest:text=>fullDigest(text,'sha256'),capsule,region:'reading',projection:'inputs',allowsEmpty,files:[{place:'input.txt',text:'input'}]});
  assert.throws(()=>read(false),/empty response is not admitted/);
  assert.equal(read(true).opened,1);assert.equal(read(true).opened,0);assert.equal(calls,2);
  assert.throws(()=>read(false),/empty response is not admitted/);assert.equal(calls,2,'cached emptiness cannot override the policy');
 }finally{rmSync(root,{recursive:true,force:true});}
});

for(const name of ['payload.bin','resource.dat'])test('byte input identity preserves non-UTF8 bytes: '+name,()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-byte-closure-')),store=join(root,'.bound');
 try {
  let runs=0;const projection=canonical({scope:'resource',role:'reads',form:'alphabet',measure:'reads',value:name,at:'receipt:1',by:'world'});
  const capsule={digest:'sha256:'+'6'.repeat(64),declaration:{regions:{}},lines:[],ask:(requests:any[])=>requests.map(req=>{
   const input=req.lines.find((line:string)=>line.includes('shape='+name));
   assert.match(input,/measure=(bytes|text)/);assert.match(input,/value=(base64|lock)/);
   if(req.verb==='render')return {protocol:PROTOCOL,kind:'fact',lines:[projection]};
   runs++;return {protocol:PROTOCOL,kind:'fact',claims:[{scope:'resource',role:'reads',measure:'count',bound:{kind:'interval',lo:1,hi:1}}]};
  })} as Capsule;
  const read=()=>{const bytes=readFileSync(join(root,name));return readingClosures({root,store,reader:'reader',speaker:'reader',digest:text=>fullDigest(text,'sha256'),capsule,region:'reading',projection:'inputs',files:[{place:name,text:bytes.toString('utf8'),bytes}]});};
  writeFileSync(join(root,name),Buffer.from([0x80]));const first=read();assert.equal(first.opened,1);assert.equal(read().opened,0);assert.equal(runs,1);
  writeFileSync(join(root,name),Buffer.from([0x81]));assert.equal(Buffer.from([0x80]).toString('utf8'),Buffer.from([0x81]).toString('utf8'));
  const changed=read();assert.equal(changed.opened,1);assert.equal(runs,2);assert.notDeepEqual(first.lines,changed.lines);
  writeFileSync(join(root,name),'base64:gQ==');const textual=read();assert.equal(textual.opened,1);assert.equal(runs,3);assert.notDeepEqual(changed.lines,textual.lines,'binary frame cannot collide with the same base64-prefixed literal text');
 }finally{rmSync(root,{recursive:true,force:true});}
});
