import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {boundedProcess} from '../src/host/process-lifetime.ts';

for(const label of ['one','two'])test(`declared lifetime bounds ${label} processes without accepting partial output`,async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-lifetime-')),entry=join(root,'run.mjs');
 const limits={timeoutMs:1000,responseBytes:8192};
 try{
  writeFileSync(entry,"process.stdout.write('complete');");const first=boundedProcess(process.execPath,[entry],'',limits);assert.equal(first.status,0);assert.equal(first.stdout,'complete');
  writeFileSync(entry,"process.stdout.write('valid-looking partial');setInterval(()=>{},1000);");assert.throws(()=>boundedProcess(process.execPath,[entry],'',{...limits,timeoutMs:100}),/declared timeout exhausted/);
  writeFileSync(entry,"process.stdout.write('x'.repeat(16384));");assert.throws(()=>boundedProcess(process.execPath,[entry],'',limits),/response exceeds declared/);
  writeFileSync(entry,"process.stdout.write('not completed');process.exitCode=3;");const failed=boundedProcess(process.execPath,[entry],'',limits);assert.equal(failed.status,3);
  if(process.platform!=='win32'){
   const marker=join(root,'child-writes');writeFileSync(entry,`import{spawn}from'node:child_process';const child=spawn(process.execPath,['-e',${JSON.stringify("const fs=require('node:fs');setInterval(()=>fs.appendFileSync(process.argv[1],'x'),20)")},${JSON.stringify(marker)}],{stdio:['ignore','pipe','pipe']});setInterval(()=>{},1000);`);
   assert.throws(()=>boundedProcess(process.execPath,[entry],'',{...limits,timeoutMs:250}),/declared timeout exhausted/);
   const before=existsSync(marker)?readFileSync(marker,'utf8'):'';await new Promise(resolve=>setTimeout(resolve,150));assert.equal(existsSync(marker)?readFileSync(marker,'utf8'):'',before,'declared child group must stop');
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
