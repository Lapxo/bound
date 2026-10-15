import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {underAuthorityRegions,underTheRegions,underTheLock,underRootProjection} from '../src/land/act.ts';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return {promise,resolve}};
test('independent child regions enter concurrently while root authority writers wait',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-guard-')),store=join(root,'.bound');mkdirSync(store);
 const both=deferred(),release=deferred();let count=0,changed=false;
 const child=(name:string)=>underAuthorityRegions(store,[name],'land',async()=>{count++;if(count===2)both.resolve();await release.promise;assert.equal(changed,false)});
 try{const a=child('catalog'),b=child('inventory');await both.promise;const writer=underTheLock(store,'root policy',()=>{changed=true});assert.equal(changed,false);release.resolve();await Promise.all([a,b,writer]);assert.equal(changed,true);assert.deepEqual(readdirSync(join(store,'locks')),[]);}finally{release.resolve();rmSync(root,{recursive:true,force:true})}
});
test('root region mutation uses the same protocol and waits for protected publication',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-root-')),store=join(root,'.bound');mkdirSync(store);const entered=deferred(),release=deferred();let changed=false;
 try{const child=underAuthorityRegions(store,['catalog'],'land',async()=>{entered.resolve();await release.promise;assert.equal(changed,false)});await entered.promise;const writer=underTheRegions(store,[''],'root mutation',()=>{changed=true});release.resolve();await Promise.all([child,writer]);assert.equal(changed,true);}finally{release.resolve();rmSync(root,{recursive:true,force:true})}
});
test('failure releases only the guarded act and refuses undeclared upgrades',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-failure-')),store=join(root,'.bound');mkdirSync(store);
 try{await assert.rejects(underAuthorityRegions(store,['catalog'],'land',()=>{throw Error('fixture failure')}),/fixture failure/);assert.deepEqual(readdirSync(join(store,'locks')),[]);await assert.rejects(underTheRegions(store,['catalog'],'land',()=>underAuthorityRegions(store,['catalog'],'upgrade',()=>{})),/declared together/);assert.deepEqual(readdirSync(join(store,'locks')),[]);}finally{rmSync(root,{recursive:true,force:true})}
});

test('host authority bookkeeping does not reserve a literal region name',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-coordinate-')),store=join(root,'.bound');mkdirSync(store);
 const entered=deferred(),release=deferred();
 try{
  const guarded=underAuthorityRegions(store,['catalog'],'land',async()=>{entered.resolve();await release.promise});await entered.promise;
  const name=readdirSync(join(store,'locks')).find(file=>file.startsWith('@authority-'));assert.ok(name);
  await underTheRegions(store,[name],'literal region',()=>{});
  release.resolve();await guarded;assert.deepEqual(readdirSync(join(store,'locks')),[]);
 }finally{release.resolve();rmSync(root,{recursive:true,force:true})}
});

test('guarded reentry preserves declared dependencies and root projection requires protection',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-reentry-')),store=join(root,'.bound');mkdirSync(store);
 try{
  await assert.rejects(underRootProjection(store,'projection',()=>{}),/requires authority protection/);
  await underAuthorityRegions(store,['catalog'],'land',async()=>{
   await underAuthorityRegions(store,['catalog'],'nested',()=>{});
   await assert.rejects(underAuthorityRegions(store,['other'],'expansion',()=>{}),/declare every region/);
   await underRootProjection(store,'projection',()=>underRootProjection(store,'nested projection',()=>{}));
  });
  assert.deepEqual(readdirSync(join(store,'locks')),[]);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('sibling publication shares authority while joined root projections have one writer',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-projection-')),store=join(root,'.bound');mkdirSync(store);
 const first=deferred(),second=deferred(),release=deferred();let secondProjected=false;
 try{
  const a=underAuthorityRegions(store,['catalog'],'land',()=>underRootProjection(store,'projection',async()=>{first.resolve();await release.promise;assert.equal(secondProjected,false)}));
  await first.promise;
  const b=underAuthorityRegions(store,['inventory'],'land',async()=>{second.resolve();await underRootProjection(store,'projection',()=>{secondProjected=true})});
  await second.promise;
  await underTheRegions(store,['@projection'],'literal region',()=>{});
  assert.equal(secondProjected,false);release.resolve();await Promise.all([a,b]);
  assert.equal(secondProjected,true);assert.deepEqual(readdirSync(join(store,'locks')),[]);
 }finally{release.resolve();rmSync(root,{recursive:true,force:true})}
});

test('authority protection is shared across processes and excludes a root writer',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-process-')),store=join(root,'.bound');mkdirSync(store);
 const module=new URL('../src/land/act.ts',import.meta.url).href;
 const start=(code:string)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['pipe','pipe','pipe']});
  let out='',err='';const changed=new Set<()=>void>();
  child.stdout.on('data',bytes=>{out+=bytes.toString();for(const wake of changed)wake()});
  child.stderr.on('data',bytes=>{err+=bytes.toString();for(const wake of changed)wake()});
  const done=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('exit',status=>{for(const wake of changed)wake();status===0?resolve():reject(Error(err||`child exited ${status}`))})});
  const wait=(matches:()=>boolean)=>new Promise<void>((resolve,reject)=>{const wake=()=>{if(matches()){changed.delete(wake);resolve()}};changed.add(wake);wake();void done.then(()=>{if(!matches())reject(Error('child exited before boundary'));},reject)});
  return {child,done,entered:()=>wait(()=>out.includes('entered')),waiting:()=>wait(()=>err.includes('WAIT'))};
 };
 const kids:ReturnType<typeof start>[]=[];
 const marker=join(root,'root-written');
 try{
  for(const region of ['catalog','inventory'])kids.push(start(`import {underAuthorityRegions} from ${JSON.stringify(module)};import {existsSync} from 'node:fs';await underAuthorityRegions(${JSON.stringify(store)},[${JSON.stringify(region)}],'child',async()=>{process.stdout.write('entered');await new Promise(resolve=>process.stdin.once('data',resolve));if(existsSync(${JSON.stringify(marker)}))throw Error('root changed during child publication');});`));
  await Promise.all(kids.map(k=>k.entered()));
  const writer=start(`import {underTheLock} from ${JSON.stringify(module)};import {writeFileSync} from 'node:fs';await underTheLock(${JSON.stringify(store)},'root',()=>writeFileSync(${JSON.stringify(marker)},'committed'));`);kids.push(writer);
  await writer.waiting();assert.equal(existsSync(marker),false);
  kids[0]!.child.stdin.end('release');await kids[0]!.done;
  assert.equal(existsSync(marker),false);
  kids[1]!.child.stdin.end('release');await Promise.all(kids.map(k=>k.done));
  assert.equal(existsSync(marker),true);assert.deepEqual(readdirSync(join(store,'locks')),[]);
 }finally{for(const k of kids){if(k.child.exitCode===null)k.child.kill('SIGTERM')}await Promise.allSettled(kids.map(k=>k.done));rmSync(root,{recursive:true,force:true})}
});
