import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync,unlinkSync,utimesSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {captureViewInputs,withViewInputObservation,sharedViewInputs,viewInput} from '../src/host/reading-context.ts';
import {observeFile,observeText} from '../src/observe/files.ts';
const limits={bytes:1048576,files:16};
test('fresh file encoding retains owned bytes, observes removal and follows current links',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fresh-encoding-')),file=join(dir,'input'),other=join(dir,'other'),link=join(dir,'link'),fixed=new Date('2020-01-01T00:00:00Z');
 const read=(at=file)=>captureViewInputs(limits,()=>observeFile(at));
 try{writeFileSync(file,'alpha');writeFileSync(other,'omega');utimesSync(file,fixed,fixed);utimesSync(other,fixed,fixed);const first=read();assert.equal(Buffer.from(first.value!).toString(),'alpha');first.value!.fill(0);assert.equal(Buffer.from(read().value!).toString(),'alpha');
  symlinkSync(file,link);const old=read(link);unlinkSync(link);symlinkSync(other,link);assert.notDeepEqual(read(link).inputs,old.inputs);
  rmSync(file);assert.equal(read().value,undefined);writeFileSync(file,'alpha');utimesSync(file,fixed,fixed);assert.deepEqual(read().inputs,first.inputs);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('an edit or removal inside one observation cannot escape through retained encoding',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fresh-encoding-race-')),file=join(dir,'input');
 try{writeFileSync(file,'alpha');assert.throws(()=>withViewInputObservation(()=>captureViewInputs(limits,()=>{const value=observeText(file);writeFileSync(file,'omega');return value})),/inputs changed/);
  assert.throws(()=>withViewInputObservation(()=>captureViewInputs(limits,()=>{const value=observeText(file);rmSync(file);return value})),/inputs changed/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('public instrument parse reuse rereads current bytes and never exposes retained configuration',async()=>{
 const {nativeHostInstrument}=await import('@lapxo/bound/host');
 const entry=new URL('../dist/cli/verb.js',import.meta.url).pathname,root=new URL('../',import.meta.url).pathname;
 const first=nativeHostInstrument(root,entry),count=first.runtime.lock.length;
 (first.runtime.lock as string[]).length=0;assert.equal(nativeHostInstrument(root,entry).runtime.lock.length,count);
 const file=new URL('../TARGET.bound',import.meta.url),original=readFileSync(file),time=statSync(file).mtime;
 try{writeFileSync(file,Buffer.alloc(original.length,32));utimesSync(file,time,time);assert.throws(()=>nativeHostInstrument(root,entry),/public instrument lock/)}finally{writeFileSync(file,original);utimesSync(file,time,time)}
 assert.equal(nativeHostInstrument(root,entry).runtime.lock.length,count);
});

test('shared computation preserves each view input identity, budget and fresh verification',()=>{
 let source='alpha',runs=0;
 const shared=sharedViewInputs(()=>{runs++;return viewInput('semantic-source',()=>source)});
 withViewInputObservation(()=>{
  const first=captureViewInputs(limits,shared),second=captureViewInputs(limits,shared);assert.deepEqual(second,first);assert.equal(runs,1);
  assert.throws(()=>captureViewInputs({bytes:1,files:1},shared),/budget/);
 });
 source='omega';withViewInputObservation(()=>{assert.equal(captureViewInputs(limits,shared).value,'omega');assert.equal(runs,2)});
 assert.throws(()=>withViewInputObservation(()=>{captureViewInputs(limits,shared);source='changed-after-capture';captureViewInputs(limits,shared)}),/inputs changed/);
});
