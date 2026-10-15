import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {underRootAuthority,underTheLock,underTheRegions,rootAuthorityProtection,assertRootAuthorityProtection} from '../src/land/act.ts';
import type {RootAuthorityProtection} from '../src/land/act.ts';

const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return {promise,resolve}};

test('authority-only reads coexist with a child region and exclude root mutation',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-read-')),store=join(root,'.bound');mkdirSync(store);
 const childEntered=deferred(),readEntered=deferred(),releaseChild=deferred(),releaseRead=deferred();let changed=false;
 try{
  const child=underTheRegions(store,['catalog'],'child',async()=>{childEntered.resolve();await releaseChild.promise});
  await childEntered.promise;
  const reading=underRootAuthority(store,'read authority',async()=>{readEntered.resolve();await releaseRead.promise;assert.equal(changed,false)});
  await readEntered.promise;
  const held=readdirSync(join(store,'locks'));assert.ok(held.includes('catalog'));assert.ok(held.some(n=>n.startsWith('@authority-')));assert.ok(!held.includes('_root'));
  const writer=underTheLock(store,'change policy',()=>{changed=true});
  releaseChild.resolve();await child;assert.equal(changed,false);
  releaseRead.resolve();await Promise.all([reading,writer]);assert.equal(changed,true);assert.deepEqual(readdirSync(join(store,'locks')),[]);
 }finally{releaseChild.resolve();releaseRead.resolve();rmSync(root,{recursive:true,force:true})}
});

test('authority-only reentry preserves the held read through an awaited callback',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-read-reentry-')),store=join(root,'.bound');mkdirSync(store);
 try{
  await underRootAuthority(store,'outer',async()=>{
   const before=readdirSync(join(store,'locks'));
   await underRootAuthority(store,'inner',async()=>{await Promise.resolve();assert.deepEqual(readdirSync(join(store,'locks')),before)});
   assert.deepEqual(readdirSync(join(store,'locks')),before);
  });
  await underTheLock(store,'root act',()=>underRootAuthority(store,'already protected',()=>{}));
  assert.deepEqual(readdirSync(join(store,'locks')),[]);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('a child region cannot silently upgrade its declared authority dependencies',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-read-upgrade-')),store=join(root,'.bound');mkdirSync(store);
 try{
  await assert.rejects(underTheRegions(store,['catalog'],'child',()=>underRootAuthority(store,'upgrade',()=>{})),/authority dependencies must be declared/);
  await assert.rejects(underRootAuthority(store,'failing read',()=>{throw Error('fixture read failure')}),/fixture read failure/);
  assert.deepEqual(readdirSync(join(store,'locks')),[]);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('inherited protection is an actual live exclusion, never a packet boolean or grant',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-inheritance-')),store=join(root,'.bound');mkdirSync(store);
 let proof!:RootAuthorityProtection;
 try{
  assert.throws(()=>rootAuthorityProtection(store),/not protected/);
  await underRootAuthority(store,'native child',()=>{
   proof=rootAuthorityProtection(store);
   assertRootAuthorityProtection(proof,store,process.pid);
   assert.throws(()=>assertRootAuthorityProtection({...proof,token:'different'},store,process.pid),/protection ended/);
   assert.throws(()=>assertRootAuthorityProtection(proof,join(root,'other'),process.pid),/invalid inherited/);
   assert.throws(()=>assertRootAuthorityProtection({guarded:true} as unknown as RootAuthorityProtection,store,process.pid),/invalid inherited/);
  });
  assert.throws(()=>assertRootAuthorityProtection(proof,store,process.pid),/protection ended/);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('a fixed child checks its parent exclusion without acquiring the parent region',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-child-')),store=join(root,'.bound');mkdirSync(store);
 const module=new URL('../src/land/act.ts',import.meta.url).href;
 try{
  await underTheLock(store,'parent fold',async()=>{
   const proof=rootAuthorityProtection(store);
   const code=`import{readFileSync}from'node:fs';import{assertRootAuthorityProtection}from ${JSON.stringify(module)};assertRootAuthorityProtection(JSON.parse(readFileSync(0,'utf8')),${JSON.stringify(store)},${process.pid});process.stdout.write('protected');`;
   const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['pipe','pipe','pipe']});
   let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
   const done=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
   child.stdin.end(JSON.stringify(proof));
   assert.equal(await done,0,stderr);assert.equal(stdout,'protected');
  });
  assert.deepEqual(readdirSync(join(store,'locks')),[]);
 }finally{rmSync(root,{recursive:true,force:true})}
});
