import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical,parse,publicationOf,PROTOCOL} from '@lapxo/topos/wire';
import {fullDigest} from '../src/host/digest.ts';
import {carriedFrom,keepCarried} from '../src/fold/resolved.ts';
import {fileRegionDigest} from '../src/fold/closed.ts';
import {readingClosures,verifiedReadingReceipts} from '../src/host/reading-closures.ts';
import type {Capsule} from '../src/host/capsule.ts';
const digest=(text:string)=>fullDigest(text,'sha256');
for(const name of ['calibration','conversion'])test(`public native receipts authenticate without a store: ${name}`,()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-public-receipt-'));let calls=0;
 try{
  writeFileSync(join(root,'input.txt'),name+'\n');
  const capsule={digest:digest(name),declaration:{regions:{}},lines:[],ask:(requests:any[])=>requests.map(req=>req.verb==='render'?{protocol:PROTOCOL,kind:'fact',lines:[canonical({scope:name,role:'reads',form:'alphabet',measure:'reads',value:'input.txt',at:'receipt:1',by:'world'})]}:(calls++,{protocol:PROTOCOL,kind:'fact',claims:[{scope:'result/'+name,role:'writes',measure:'status',bound:{kind:'enumerated',values:['met']}}]}))} as Capsule;
  const options={root,store:join(root,'.bound'),reader:name,speaker:'reader',digest,capsule,region:'reading',projection:'inputs',files:[{place:'input.txt',text:readFileSync(join(root,'input.txt'),'utf8')}]};
  const first=readingClosures(options);assert.equal(first.opened,1);
  const copied=first.lines.map(line=>canonical(parse(line).value.fields));
  assert.equal(verifiedReadingReceipts(join(root,'no-store'),copied,digest),1);
  const idle=readingClosures(options);assert.equal(idle.opened,0);assert.equal(calls,1);assert.deepEqual(idle.lines,copied);
  const corrupt=copied.map(line=>{const f=parse(line).value.fields;return f.measure==='bytes'?canonical({...f,about:f.about+'tampered'}):line;});
  assert.equal(verifiedReadingReceipts(options.store,corrupt,digest),undefined,'valid local CAS cannot hide corrupt shipped bytes');
  const missing=copied.map(line=>{const f=parse(line).value.fields;const {about,...rest}=f;return f.measure==='count'?canonical(rest):line;});
  assert.equal(verifiedReadingReceipts(join(root,'no-store'),missing,digest),undefined,'absence is not verified closure');
 }finally{rmSync(root,{recursive:true,force:true});}
});
for(const name of ['calibration','inventory'])test(`configuration public projection preserves file seal: ${name}`,()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-public-lock-'));
 try{
  const lock=join(root,'TARGET.bound');writeFileSync(join(root,'input.txt'),name);
  const row=(epoch:string,sig:string)=>canonical({scope:'name',role:'writes',form:'alphabet',measure:'id',value:name,at:'policy:identity',by:'device',epoch,sig});
  const original=row('2','signature-a');writeFileSync(lock,original+'\n');const before=fileRegionDigest(root,'','receipts/.','sha256');
  writeFileSync(lock,row('7','signature-b')+'\n');assert.equal(fileRegionDigest(root,'','receipts/.','sha256'),before,'delivery envelopes do not enter public file identity');
  writeFileSync(lock,publicationOf([original]).join('\n')+'\n');assert.equal(fileRegionDigest(root,'','receipts/.','sha256'),before);
  writeFileSync(lock,canonical({...parse(original).value.fields,value:name+'-changed'})+'\n');assert.notEqual(fileRegionDigest(root,'','receipts/.','sha256'),before,'a live configuration change invalidates the seal');
  writeFileSync(lock,original+'\n');writeFileSync(join(root,'input.txt'),'different bytes');assert.notEqual(fileRegionDigest(root,'','receipts/.','sha256'),before);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('a cached authentic carrier cannot hide altered public full-resolution evidence',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-receipt-carrier-'));
 try{
  const body=[canonical({scope:'read/source',role:'writes',form:'alphabet',measure:'status',value:'met',at:'place:source',by:'reader'})];
  const id=keepCarried(root,body),header=canonical({scope:'receipts',role:'writes',form:'alphabet',measure:'digest',value:digest('summary'),at:'place:'+id,by:'bound'});
  assert.deepEqual(carriedFrom(join(root,'empty'),[...body,header]),body);
  assert.throws(()=>carriedFrom(root,[body[0].replace('value=met','value=failed'),header]),/REFUSE·receipt public carrier bytes mismatch/);
  assert.deepEqual(carriedFrom(root,[header]),body,'a summary-only local view keeps its existing CAS contract');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('signed native receipt evidence is not mistaken for the public carrier header',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-receipt-evidence-'));
 try{
  const body=[canonical({scope:'receipts',role:'writes',form:'alphabet',measure:'digest',value:digest('earlier'),at:'place:'+digest('earlier-body'),by:'device',epoch:'3',sig:'signed-evidence'})];
  const id=keepCarried(root,body),header=canonical({scope:'receipts',role:'writes',form:'alphabet',measure:'digest',value:digest('summary'),at:'place:'+id,by:'bound'});
  assert.deepEqual(carriedFrom(join(root,'empty'),[...body,header]),body);
 }finally{rmSync(root,{recursive:true,force:true});}
});
