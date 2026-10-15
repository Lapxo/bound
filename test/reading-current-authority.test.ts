import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical,PROTOCOL} from '@lapxo/topos/wire';
import {fullDigest} from '../src/host/digest.ts';
import {readingClosures} from '../src/host/reading-closures.ts';
import type {Capsule} from '../src/host/capsule.ts';

test('a paid reading remains evidence but cannot bypass revoked current authority',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-current-authority-'));
 try{
  writeFileSync(join(root,'data.txt'),'data');
  let allowed=true,reads=0;
  const capsule={digest:fullDigest('provider','sha256'),lines:[],declaration:{regions:{}},ask:(requests:any[])=>requests.map(req=>req.verb==='render'
   ?{protocol:PROTOCOL,kind:'fact',lines:[canonical({scope:'data',role:'reads',form:'alphabet',measure:'reads',value:'data.txt',at:'receipt:1'})]}
   :(reads++,{protocol:PROTOCOL,kind:'fact',claims:[{scope:'result',role:'reads',measure:'count',bound:{kind:'interval',lo:1,hi:1}}]}))} as Capsule;
  const read=()=>readingClosures({root,store:join(root,'.bound'),reader:'reader',speaker:'reader',digest:text=>fullDigest(text,'sha256'),capsule,region:'read',projection:'inputs',files:[{place:'data.txt',text:'data'}],assertCurrent:()=>{if(!allowed)throw Error('REFUSE·current authority revoked');}});
  const first=read();assert.equal(reads,1);assert.equal(read().executed,0);
  allowed=false;assert.throws(read,/current authority revoked/);assert.equal(reads,1);
  allowed=true;assert.deepEqual(read().lines,first.lines);assert.equal(reads,1,'revocation refused reuse without destroying authenticated evidence');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('authority lost during execution cannot publish a successful reading receipt',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-authority-commit-'));
 try{
  writeFileSync(join(root,'data.txt'),'data');
  let allowed=true,revoke=true,reads=0;
  const capsule={digest:fullDigest('provider','sha256'),lines:[],declaration:{regions:{}},ask:(requests:any[])=>requests.map(req=>{
   if(req.verb==='render')return{protocol:PROTOCOL,kind:'fact',lines:[canonical({scope:'data',role:'reads',form:'alphabet',measure:'reads',value:'data.txt',at:'receipt:1'})]};
   reads++;if(revoke)allowed=false;
   return{protocol:PROTOCOL,kind:'fact',claims:[{scope:'result',role:'reads',measure:'count',bound:{kind:'interval',lo:1,hi:1}}]};
  })} as Capsule;
  const read=()=>readingClosures({root,store:join(root,'.bound'),reader:'reader',speaker:'reader',digest:text=>fullDigest(text,'sha256'),capsule,region:'read',projection:'inputs',files:[{place:'data.txt',text:'data'}],assertCurrent:()=>{if(!allowed)throw Error('REFUSE·current authority revoked');}});
  assert.throws(read,/current authority revoked/);
  allowed=true;revoke=false;assert.equal(read().executed,1);assert.equal(reads,2,'the interrupted reading did not become a paid receipt');
  assert.equal(read().executed,0);assert.equal(reads,2);
 }finally{rmSync(root,{recursive:true,force:true});}
});
