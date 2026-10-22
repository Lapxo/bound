import{test}from'node:test';import assert from'node:assert/strict';import{mkdtempSync,writeFileSync,readFileSync,rmSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{canonical,parse,PROTOCOL}from'@lapxo/topos/wire';import{fullDigest}from'../src/host/digest.ts';import{readingClosures,verifiedReadingReceipts}from'../src/host/reading-closures.ts';import type{ReadingIdentityContext}from'@lapxo/topos/contract';import type{Capsule}from'../src/host/capsule.ts';
const hash=(text:string)=>fullDigest(text,'sha256');
for(const name of ['survey','inventory'])test('declared semantic context and receipt retain authentic evidence: '+name,()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-context-'));let calls=0;
 try{writeFileSync(join(root,'input.txt'),name);const capsule={digest:hash('controlled implementation'),lines:[],declaration:{regions:{}},ask:(requests:any[])=>requests.map(req=>req.verb==='render'?{protocol:PROTOCOL,kind:'fact',lines:[canonical({scope:name,role:'reads',form:'alphabet',measure:'reads',value:'input.txt',at:'receipt:1'})]}:(calls++,{protocol:PROTOCOL,kind:'fact',claims:[{scope:'seen/'+name,role:'reads',measure:'status',bound:{kind:'enumerated',values:['met']}}]}))}as Capsule;
 const context:ReadingIdentityContext={instrument:'declared-instrument',implementation:capsule.digest,policy:'declared-policy',inputs:[['transitive',hash('declared transitive input')]],environment:[['b','declared-b'],['a','declared-a']]};
 const read=(ctx:ReadingIdentityContext|undefined)=>readingClosures({root,store:join(root,'.bound'),reader:name,speaker:'reader',digest:hash,capsule,region:'reading',projection:'inputs',context:ctx,files:[{place:'input.txt',text:readFileSync(join(root,'input.txt'),'utf8')}]});
 const first=read(context);assert.equal(first.opened,1);assert.equal(calls,1);assert.equal(verifiedReadingReceipts(join(root,'no-store'),first.lines,hash),1);
 assert.equal(verifiedReadingReceipts(join(root,'no-store'),first.lines,hash,ctx=>ctx.implementation===capsule.digest?context.environment:undefined,true),1);
 const counts=first.lines.filter(l=>{const f=parse(l).value.fields;return f.scope.startsWith('receipts/readings/')&&f.measure==='count'});assert.equal(counts.length,1);
 assert.equal(verifiedReadingReceipts(join(root,'no-store'),[...first.lines,counts[0]!],hash,undefined,true),undefined,'a duplicate count remains ambiguous');
 const identityRow=first.lines.find(l=>parse(l).value.fields.scope.endsWith('/identity'))!;assert.equal(verifiedReadingReceipts(join(root,'no-store'),[...first.lines,identityRow],hash,undefined,true),undefined,'a duplicate identity remains ambiguous');
 const carried=join(root,'portable-copy'),carriers=new Map<string,string>();mkdirSync(join(carried,'cas/carried'),{recursive:true});
 const portable=first.lines.map(line=>{const f=parse(line).value.fields;if(f.scope.startsWith('receipts/readings/')&&['bytes','count'].includes(f.measure)&&f.about!==undefined){const id=f.measure==='bytes'?f.value:f.at.replace(/^place:/,'');carriers.set(id,f.about);writeFileSync(join(carried,'cas/carried',id.split(':')[1]!),f.about);const {about,...without}=f;return canonical(without);}return line;});
 assert.equal(verifiedReadingReceipts(carried,portable,hash,undefined,true),1);
 for(const[id,text]of carriers){const file=join(carried,'cas/carried',id.split(':')[1]!);writeFileSync(file,text+' ');assert.equal(verifiedReadingReceipts(carried,portable,hash,undefined,true),undefined,'current carrier bytes are checked on every invocation');writeFileSync(file,text);assert.equal(verifiedReadingReceipts(carried,portable,hash,undefined,true),1);}

 assert.equal(verifiedReadingReceipts(join(root,'no-store'),first.lines,hash,()=>undefined,true),undefined,'unknown current execution boundary does not authorize retained evidence');
 assert.equal(verifiedReadingReceipts(join(root,'no-store'),first.lines,hash,()=>[['a','different'],['b','declared-b']],true),undefined,'reconstructing a boundary still compares every environment reference');
 const quiet=read({...context,environment:[...context.environment].reverse()});assert.equal(quiet.opened,0);assert.equal(calls,1);assert.deepEqual(quiet.lines,first.lines);
 const marker=first.lines.find(l=>parse(l).value.fields.scope.endsWith('/identity'))!;assert.ok(marker);const tampered=first.lines.map(l=>l===marker?canonical({...parse(l).value.fields,value:hash('different receipt')}):l);assert.equal(verifiedReadingReceipts(join(root,'no-store'),tampered,hash),undefined);
 for(const field of ['instrument','implementation','policy']as const){assert.equal(read({...context,[field]:context[field]+'-changed'}).opened,1);}
 assert.equal(read({...context,inputs:[['transitive',hash('different')]]}).opened,1);
 assert.equal(read({...context,environment:[['b','different'],['a','declared-a']]}).opened,1);
 const before=calls;const {environment,...unknown}=context;assert.throws(()=>read(unknown as ReadingIdentityContext),/missing environment/);assert.equal(calls,before,'unknown environment refuses before invoking the provider');
 assert.equal(read(undefined).opened,1,'legacy identity stays separate; it is never promoted to the declared profile');
 }finally{rmSync(root,{recursive:true,force:true});}
});

import{readingEnvironment,readingExecution,readingProfile,withReadingBoundary}from'../src/host/reading-context.ts';
import{instrumentCoordinates}from'../src/fold/digests.ts';
import{capsuleAt}from'../src/host/capsule.ts';
import{mkdirSync,copyFileSync}from'node:fs';
import{execFileSync}from'node:child_process';

test('the host commits actual inherited values without publishing environment secrets',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-context-boundary-'));
 try{
  const one=readingEnvironment(hash,{TOKEN:'private-one',EMPTY:''},root,[]),two=readingEnvironment(hash,{EMPTY:'',TOKEN:'private-one'},root,[]);
  assert.deepEqual(one,two);assert.notEqual(JSON.stringify(readingEnvironment(hash,{TOKEN:'private-two',EMPTY:''},root,[])),JSON.stringify(one));
  assert.notEqual(JSON.stringify(readingEnvironment(hash,{TOKEN:'private-one'},root,[])),JSON.stringify(one),'absence differs from a present empty value');
  assert.doesNotMatch(JSON.stringify(one),/private-one|TOKEN/);
  const profiles=['reading-context','reading-receipt'].map((scope,i)=>canonical({scope:'wire/'+scope,role:'writes',form:'alphabet',measure:'id',value:i?'reading-receipt@1':'reading-context@1',by:'target',at:'policy:reading'}));
  const field=(line:string,key:string)=>parse(line).value.fields[key]??'';
  assert.equal(readingProfile([],field),false);assert.equal(readingProfile(profiles,field),true);
  assert.throws(()=>readingProfile(profiles.slice(0,1),field),/incomplete/);assert.throws(()=>readingProfile([...profiles,profiles[0]!],field),/ambiguous/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('actual capsule reuse follows the reading boundary rather than an old answer slot',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-context-capsule-'));
 try{
  const world=join(root,'world'),store=join(root,'.bound');mkdirSync(world);mkdirSync(join(store,'cas/blobs'),{recursive:true});
  writeFileSync(join(world,'package.json'),'{"type":"module"}\n');
  writeFileSync(join(world,'capsule.bound'),canonical({scope:'region/probe',role:'writes',form:'alphabet',measure:'reads',value:'**',by:'target',at:'policy:test'})+'\n');
  writeFileSync(join(world,'index.js'),`export const observe=()=>[{scope:'boundary',role:'reads',measure:'text',bound:{kind:'enumerated',values:[process.env.BOUNDARY_VALUE??'absent']}}];\n`);
  const archive=join(root,'world.tgz');execFileSync('tar',['-czf',archive,'-C',world,'package.json','capsule.bound','index.js']);
  const bytes=readFileSync(archive),digest='sha256:'+(awaitHash(bytes));copyFileSync(archive,join(store,'cas/blobs',digest.split(':')[1]!));
  const capsule=capsuleAt(digest,'index.js',store)!;
  const request:any={protocol:PROTOCOL,verb:'read',region:'probe',rootScope:'input',files:[{place:'input',text:'same request'}]};
  const seed={instrument:hash('instrument'),implementation:digest,policy:hash('policy'),inputs:[]};
  const ask=(identity:string,execution:any)=>withReadingBoundary(identity,execution,()=>capsule.ask([request])[0]);
  const execution=(value:string)=>readingExecution(seed,hash,{env:{BOUNDARY_VALUE:value},cwd:process.cwd(),flags:[]});
  const first=ask(hash('reading one'),execution('first'));assert.equal(first?.kind,'fact');assert.equal((first as any).claims[0].bound.values[0],'first');
  const second=ask(hash('reading two'),execution('second'));assert.equal((second as any).claims[0].bound.values[0],'second');
  assert.deepEqual(ask(hash('reading one'),execution('first')),first);
  assert.throws(()=>ask(hash('reading one'),{...execution('first'),env:{BOUNDARY_VALUE:'forged'}}),/execution environment differs/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
function awaitHash(bytes:Uint8Array):string{return createHash('sha256').update(bytes).digest('hex');}
import{createHash}from'node:crypto';

import{snapshotIdentity}from'@lapxo/topos/contract';
test('inspection never grants reuse of a current response across principals, snapshots or grants',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-current-reading-'));let calls=0;
 try{
  writeFileSync(join(root,'input.txt'),'kept');
  const capsule={digest:hash('current implementation'),lines:[],declaration:{regions:{}},ask:(requests:any[])=>requests.map(req=>req.verb==='render'?{protocol:PROTOCOL,kind:'fact',lines:[canonical({scope:'read',role:'reads',form:'alphabet',measure:'reads',value:'input.txt',at:'receipt:1'})]}:(calls++,{protocol:PROTOCOL,kind:'fact',claims:[{scope:'observed',role:'reads',measure:'count',bound:{kind:'interval',lo:1,hi:1}}]}))}as Capsule;
  const context={instrument:hash('instrument'),implementation:capsule.digest,policy:hash('policy'),inputs:[],environment:[]};
  const snapshot={source:'declared origin',content:hash('content'),observed:'declared epoch',clock:'declared clock',freshness:'declared validity',implementation:capsule.digest};
  const current={principal:'one',authorization:'grant-one',implementation:capsule.digest,snapshot:snapshotIdentity(snapshot,hash),request:'declared request'};
  const permission={inspect:true,reuse:true,freshness:'fresh' as const};
  const access={snapshot,kept:current,current,permission};
  const read=(currentReading:any)=>readingClosures({root,store:join(root,'.bound'),reader:'reader',speaker:'reader',digest:hash,capsule,region:'reading',projection:'inputs',context,current:currentReading,files:[{place:'input.txt',text:'kept'}]});
  assert.equal(read(access).opened,1);assert.equal(read(access).opened,0);assert.equal(calls,1);
  for(const changed of [
   {...access,current:{...current,principal:'other'}},
   {...access,current:{...current,authorization:'withdrawn grant'}},
   {...access,current:{...current,request:'other request'}},
   {...access,permission:{...permission,reuse:false}},
   {...access,permission:{...permission,inspect:false}},
   {...access,permission:{...permission,freshness:'unknown'}},
   {...access,permission:{...permission,freshness:'stale'}},
  ])assert.throws(()=>read(changed),/not admitted for reuse/);
  assert.throws(()=>read({...access,snapshot:{...snapshot,implementation:'other'},current:{...current,implementation:'other'},kept:{...current,implementation:'other'}}),/implementation differs/);
  assert.equal(calls,1,'permission refusals run no provider and create no successful observation');
  const authorized={...current,principal:'two',authorization:'grant-two'};
  assert.equal(read({...access,current:authorized,kept:authorized}).opened,1,'a new admitted current response has another identity');
  const nextSnapshot={...snapshot,content:hash('next content'),observed:'next epoch'},next={...current,snapshot:snapshotIdentity(nextSnapshot,hash)};
  assert.throws(()=>read({...access,snapshot:nextSnapshot,current:next}),/not admitted for reuse/);
  assert.equal(read({...access,snapshot:nextSnapshot,current:next,kept:next}).opened,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('a complete profile never promotes an old receipt or accepts a noncanonical context',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-context-no-promotion-'));
 try{
  writeFileSync(join(root,'input.txt'),'input');
  const capsule={digest:hash('implementation'),lines:[],declaration:{regions:{}},ask:(requests:any[])=>requests.map(req=>req.verb==='render'?{protocol:PROTOCOL,kind:'fact',lines:[canonical({scope:'one',role:'reads',form:'alphabet',measure:'reads',value:'input.txt',at:'receipt:1'})]}:{protocol:PROTOCOL,kind:'fact',claims:[{scope:'one',role:'reads',measure:'count',bound:{kind:'interval',lo:1,hi:1}}]})}as Capsule;
  const read=(context:any)=>readingClosures({root,store:join(root,'.bound'),reader:'one',speaker:'reader',digest:hash,capsule,region:'reading',projection:'inputs',context,files:[{place:'input.txt',text:'input'}]});
  const legacy=read(undefined);assert.equal(verifiedReadingReceipts(join(root,'empty'),legacy.lines,hash),1);assert.equal(verifiedReadingReceipts(join(root,'empty'),legacy.lines,hash,undefined,true),undefined);
  const context={instrument:hash('instrument'),implementation:capsule.digest,policy:hash('policy'),inputs:[],environment:[]};
  const modern=read(context);assert.equal(modern.opened,1);assert.equal(verifiedReadingReceipts(join(root,'empty'),modern.lines,hash,[],true),1);assert.equal(verifiedReadingReceipts(join(root,'empty'),modern.lines,hash,[['changed',hash('environment')]],true),undefined);
  const typed=modern.lines.find(l=>parse(l).value.fields.measure==='bytes')!;
  const f=parse(typed).value.fields;
  assert.ok(f.about.startsWith('["reading-context@1",'));
  const noncanonical=modern.lines.map(l=>l===typed?canonical({...f,about:' '+f.about}):l);assert.equal(verifiedReadingReceipts(join(root,'empty'),noncanonical,hash,[],true),undefined);
 }finally{rmSync(root,{recursive:true,force:true});}
});
