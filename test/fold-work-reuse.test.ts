import{fileRegionDigest,fileRegionDigests}from'../src/fold/closed.ts';import{withHostCall}from'../src/host/call-context.ts';
import{test}from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{mkdtempSync,mkdirSync,writeFileSync,rmSync,statSync,utimesSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import{canonical}from'@lapxo/topos/wire';import{receiptProjection}from'@lapxo/topos/receipts';import{projectedReceipts}from'../src/render/receipt-projection.ts';import{portableReadingReceipt,verifiedReadingReceipts}from'../src/host/reading-closures.ts';import{readingIdentityBytes}from'@lapxo/topos/contract';import{traceWork,withWorkTrace}from'../src/host/work-trace.ts';import{ActCosts}from'../src/host/act-cost.ts';
const hash=(s:string)=>'sha256:'+createHash('sha256').update(s).digest('hex');
test('receipt projection reuses exact content across distinct arrays; outputs remain native bytes',()=>{
 const rows=[canonical({scope:'sample/one',role:'reads',form:'interval',measure:'count',value:'1..1',by:'reader',at:'place:'+hash('input')})],fields=['scope','role','form','measure','value','by','at'];
 const a=projectedReceipts(rows,fields,hash,[]),b=projectedReceipts([...rows],[...fields],hash,[]);assert.strictEqual(a,b);assert.deepEqual(a,receiptProjection(rows,fields,hash,[]));
 const changed=[rows[0]!.replace('value=1..1','value=2..2')];assert.notStrictEqual(projectedReceipts(changed,fields,hash,[]),a);assert.deepEqual(projectedReceipts(changed,fields,hash,[]),receiptProjection(changed,fields,hash,[]));
 assert.notStrictEqual(projectedReceipts(rows,fields,hash,['other']),a);assert.notStrictEqual(projectedReceipts(rows,[...fields,'extra'],hash,[]),a);assert.ok(Object.isFrozen(a));
});
test('retained unit validation still hashes current CAS bytes and rejects duplicates and altered carriers',()=>{
 const temp=mkdtempSync(join(tmpdir(),'fold-unit-reuse-')),cas=join(temp,'cas','carried');mkdirSync(cas,{recursive:true});let hashes=0;const measured=(s:string)=>{hashes++;return hash(s)};
 const closure=new TextDecoder().decode(readingIdentityBytes({instrument:hash('engine'),implementation:hash('reader'),policy:hash('policy'),inputs:[['fixture',hash('original')]],environment:[]})),input=hash(closure),by='reader:test',output=canonical({scope:'measure/test',role:'reads',form:'interval',measure:'count',value:'1..1',by,at:'place:'+input})+'\n',payload=hash(output),scope='receipts/readings/test/'+input.slice(7);
 const rows=portableReadingReceipt(scope,by,closure,output,hash).map(line=>{const at=line.indexOf(' about=');return at<0?line:line.replace(/ about="(?:\\.|[^"\\])*"/,'')});
 writeFileSync(join(cas,input.slice(7)),closure);writeFileSync(join(cas,payload.slice(7)),output);
 try{
  hashes=0;assert.equal(verifiedReadingReceipts(temp,rows,measured,undefined,true),1);const cold=hashes;
  hashes=0;assert.equal(verifiedReadingReceipts(temp,[...rows],measured,undefined,true),1);assert.ok(hashes<cold,'canonical unit validation is reused');assert.ok(hashes>=2,'both actual carriers remain hashed');
  const path=join(cas,payload.slice(7)),stamp=statSync(path);writeFileSync(path,output.replace('1..1','2..2'));utimesSync(path,stamp.atime,stamp.mtime);assert.equal(verifiedReadingReceipts(temp,rows,measured,undefined,true),undefined);writeFileSync(path,output);
  const count=rows.find(line=>line.includes(' measure=count '))!;assert.equal(verifiedReadingReceipts(temp,[...rows,count],hash,undefined,true),undefined);
  const identity=rows.find(line=>line.includes(' measure=digest '))!;assert.equal(verifiedReadingReceipts(temp,[...rows,identity],hash,undefined,true),undefined);
  assert.equal(verifiedReadingReceipts(temp,rows,hash,()=>undefined,true),undefined);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
test('work phases partition elapsed time, including gaps and repeated document phases',async()=>{
 let now=0,report:any;const value=await withWorkTrace(()=>{now=2;traceWork('docs',()=>{now=5});now=6;traceWork('docs',()=>{traceWork('capsules',()=>{now=8});now=9});now=10;return 'same result'},r=>{report=r},()=>now);
 assert.equal(value,'same result');assert.equal(report.totalMilliseconds,10);assert.equal(report.exclusiveMilliseconds,10);assert.equal(report.complete,true);const phases=Object.fromEntries(report.phases.map((p:any)=>[p.name,p.milliseconds]));assert.deepEqual(phases,{'command/dispatch':4,docs:4,capsules:2});
 const error=new Error('original refusal');await assert.rejects(withWorkTrace(()=>traceWork('failure',()=>{now+=2;throw error}),r=>{report=r},()=>now),e=>e===error);assert.equal(report.exclusiveMilliseconds,report.totalMilliseconds);
});
test('cost diagnostic retains the native largest-act/unpartitioned accounting',()=>{let now=0;const costs=new ActCosts(()=>now);now=2;const end=costs.begin();now=7;end();now=11;assert.deepEqual(costs.measurement(),{elapsedMilliseconds:11,declaredMilliseconds:5,largestDeclaredMilliseconds:5,unpartitionedMilliseconds:6,costMilliseconds:6});assert.equal(costs.seconds(),0)});

test('full native pass accounts its elapsed phases without adding output to read-only views',async()=>{
 const{actingRootFixture}=await import('./support/acting-root.ts');
 for(const place of ['field-notes','tide-register']){
  const f=actingRootFixture(place,[],{places:[]});
  try{
   const run=f.run(['fold']);assert.equal(run.status,0,run.stderr+run.stdout);const line=run.stderr.split('\n').find(line=>line.startsWith('SPENT pass '));assert.ok(line,run.stderr);const report=JSON.parse(line.slice('SPENT pass '.length));assert.equal(report.complete,true);assert.ok(Math.abs(report.exclusiveMilliseconds-report.totalMilliseconds)<1e-6);assert.ok(Math.abs(report.accountedActElapsedMilliseconds-report.act.elapsedMilliseconds)<1e-6);assert.equal(report.act.costMilliseconds,Math.max(report.act.largestDeclaredMilliseconds,report.act.unpartitionedMilliseconds));assert.ok(report.phases.some((p:any)=>p.name==='pass/final-judgement'));
   const view=f.run(['fold','--as','lines']);assert.equal(view.status,0,view.stderr);assert.doesNotMatch(view.stderr,/SPENT pass /);
  }finally{f.close()}
 }
});

for (const domain of ['catalogue', 'rainfall']) test('batched file seals retain current selection and bytes in '+domain,()=>{const root=mkdtempSync(join(tmpdir(),'seal-batch-'));try{
  const rows=(scope:string,measure:string,value:string,extra:Record<string,string>={})=>canonical({scope,measure,value,role:'writes',form:'alphabet',by:'target',at:'policy:seal',...extra});
  const lock=join(root,'TARGET.bound'),foreign=rows('leaf-role/vendor','role','foreign');
  writeFileSync(lock,foreign+'\n');mkdirSync(join(root,'vendor'));mkdirSync(join(root,'src'));
  writeFileSync(join(root,'src','note.txt'),domain+' original\n');writeFileSync(join(root,'vendor','used.txt'),'external input\n');writeFileSync(join(root,'vendor','unused.txt'),'not consumed\n');
  const inputs=['vendor/used.txt','src/note.txt'].flatMap(scope=>Array.from({length:32},(_,i)=>rows(scope,'observed','read',{by:'reader:'+i})));
  const scopes=['receipts/.','receipts/src','receipts/vendor','receipts/absent'];
  withHostCall({instrumentName:'bound',freshBytes:true},()=>{
    const read=()=>fileRegionDigests(root,'',scopes,'sha256',inputs),before=read();
    assert.deepEqual(before,scopes.map(scope=>fileRegionDigest(root,'',scope,'sha256',inputs)));
    assert.deepEqual(read(),before);assert.deepEqual(fileRegionDigests(root,'',scopes,'sha256',[...inputs].reverse()),before);
    const used=join(root,'vendor','used.txt'),stamp=statSync(used);writeFileSync(used,'external Input\n');utimesSync(used,stamp.atime,stamp.mtime);
    const changed=read();assert.notEqual(changed[0],before[0]);assert.notEqual(changed[2],before[2]);assert.equal(changed[1],before[1]);
    writeFileSync(join(root,'vendor','unused.txt'),'unrelated mutation\n');assert.deepEqual(read(),changed);
    writeFileSync(join(root,'src','added.txt'),'new owned bytes\n');const added=read();assert.notEqual(added[1],changed[1]);assert.equal(added[2],changed[2]);
    rmSync(used);assert.notEqual(read()[2],added[2]);
    writeFileSync(lock,rows('leaf-role/vendor','role','source')+'\n');assert.notEqual(read()[2],added[2]);
    assert.deepEqual(fileRegionDigests(root,'',[],'sha256',inputs),[]);
  });
}finally{rmSync(root,{recursive:true,force:true})}});
