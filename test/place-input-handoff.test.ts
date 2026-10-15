import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical,PROTOCOL} from '@lapxo/topos/wire';
import {readStanding,standingBytes} from '@lapxo/topos/standing';
import {respond,placeInputs} from '@lapxo/topos/contract';
import {readingClosures} from '../src/host/reading-closures.ts';
import {readingExecution,readingBoundary} from '../src/host/reading-context.ts';
import {fullDigest} from '../src/host/digest.ts';
import type {Capsule} from '../src/host/capsule.ts';
const hash=(text:string)=>fullDigest(text,'sha256');
const row=(scope:string,value:string,extra:Record<string,string>={})=>canonical({scope,role:'writes',form:'alphabet',measure:'id',value,at:'policy:fixture',...extra});
for(const name of ['survey','inventory'])test('selected consumer envelope commits full reading identity: '+name,()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-place-handoff-'));let calls=0;
 try{
  writeFileSync(join(root,'input.txt'),name);
  const world=readStanding(standingBytes([row('wire/place-inputs','admitted-place-inputs@1'),...['inputs','reading'].map(region=>row('offers/read/place-inputs/'+region,'configuration/needed',{measure:'reads',role:'demands'}))]));
  // This unit boundary is injected verified live data; native two-place vectors test authentication separately.
  let live=[row('configuration/needed','initial')];let handed:string|undefined;
  const library={render:(asked:any)=>{assert.ok(asked.place);return[canonical({scope:'reading',role:'reads',form:'alphabet',measure:'reads',value:'input.txt',at:'receipt:1'})];},receipt:(asked:any)=>{calls++;assert.ok(asked.place);handed=asked.place.digest;const boundary=readingBoundary()!;assert.ok(boundary.execution!.context.inputs.some(([,digest])=>digest===handed));return[{scope:'seen/'+name,role:'reads',measure:'status',bound:{kind:'enumerated',values:['met']}}];}};
  const capsule={digest:hash('implementation'),selection:'selected world offers/read',selectedWorld:{standing:world,offer:'offers/read'},lines:[],declaration:{regions:{}},ask:(requests:any[])=>JSON.parse(respond(library,JSON.stringify(requests),'fixture.js'))}as Capsule;
  const execution=readingExecution({instrument:hash('instrument'),implementation:capsule.digest,policy:hash('policy'),inputs:[['transitive',hash('transitive')]]},hash,{env:process.env,cwd:root,flags:process.execArgv});
  const options={root,store:join(root,'.bound'),reader:name,speaker:'reader',digest:hash,capsule,region:'reading',projection:'inputs',context:execution.context,execution,livePlace:()=>live,files:[{place:'input.txt',text:name}]};
  assert.equal(readingClosures(options).opened,1);assert.equal(calls,1);assert.equal(readingClosures(options).opened,0);
  live=[...live,row('configuration/unrelated','change')];assert.equal(readingClosures(options).opened,0);assert.equal(calls,1);
  live=[row('configuration/needed','changed')];assert.equal(readingClosures(options).opened,1);assert.equal(calls,2);
  const expected=placeInputs(world,'offers/read','reading',live,bytes=>hash(new TextDecoder().decode(bytes)))!;assert.equal(handed,expected.digest);
  const contexts=readdirSync(join(root,'.bound/cas/carried')).flatMap(file=>{try{const json=JSON.parse(readFileSync(join(root,'.bound/cas/carried',file),'utf8'));return json[0]==='reading-context@1'?[json]:[];}catch{return[];}});
  assert.ok(contexts.some(ctx=>ctx[1]===execution.context.instrument&&ctx[2]===capsule.digest&&ctx[4].some(([,digest]:any)=>digest===expected.digest)&&ctx[5].length===5));
  live=[];assert.throws(()=>readingClosures(options),/place inputs required member absent/);assert.equal(calls,2);
  assert.throws(()=>readingClosures({...options,context:undefined,execution:undefined}),/authenticated shadow and reading context/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
