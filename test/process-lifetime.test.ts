import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {boundedProcess} from '../src/host/process-lifetime.ts';
import {executeCapsule} from '../src/host/capsule-process.ts';
import {pathToFileURL} from 'node:url';
import {PROTOCOL} from '@lapxo/topos/wire';

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

test('the declared deadline covers incomplete supervisor input before a command exists',async()=>{
 const {spawn}=await import('node:child_process');
 const deadline=process.hrtime.bigint()+150000000n;
 const child=spawn(process.execPath,[new URL('../src/host/lifetime.ts',import.meta.url).pathname,String(deadline),'8192'],{stdio:['pipe','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stdin.on('error',()=>{});
 child.stdin.write('{"command":');
 const status=await new Promise<number|null>((resolve,reject)=>{const guard=setTimeout(()=>{child.kill('SIGKILL');reject(Error('supervisor did not enforce the declared deadline'))},1500);child.on('close',code=>{clearTimeout(guard);resolve(code)})});
 assert.equal(status,0);const result=JSON.parse(output);assert.equal(result.failure,'declared timeout exhausted');assert.equal(result.stdout,'');
});

test('a large handed input is read within the declared lifetime',()=>{
 const input='x'.repeat(1048576);
 const result=boundedProcess(process.execPath,['-e',"const fs=require('fs');process.stdout.write(String(fs.readFileSync(0).length))"],input,{timeoutMs:1000,responseBytes:8192});
 assert.equal(result.status,0);assert.equal(result.stdout,String(input.length));
});

test('capsule lifetime preserves the same declared directory as a path or file URL',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-lifetime-directory-'));
 const request={protocol:PROTOCOL,verb:'read' as const,rootScope:'directory',at:0 as const};
 const code=`const fs=require('node:fs');fs.readFileSync(0);process.stdout.write(JSON.stringify([{protocol:${JSON.stringify(PROTOCOL)},kind:'fact',claims:[]}]))`;
 try{
  const limits={timeoutMs:1000,responseBytes:8192};
  const path=executeCapsule(process.execPath,['-e',code],[request],{cwd:root},limits);
  const url=executeCapsule(process.execPath,['-e',code],[request],{cwd:pathToFileURL(root)},limits);
  assert.deepEqual(url,path);
 }finally{rmSync(root,{recursive:true,force:true})}
});

for(const place of ['catalog','inventory'])test(`early ${place} rejection keeps bounded stderr after a large input pipe fails`,()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-early-reject-'+place+'-')),entry=join(root,'reject.mjs'),input='x'.repeat(2*1048576),limits={timeoutMs:1000,responseBytes:8192},marker='REFUSE·early '+place;
 try{writeFileSync(entry,`process.stderr.write(${JSON.stringify(marker+'\n')});process.stdout.write('{"protocol":"bound-lock/1","kind":"fact","claims":[]}');process.exit(1);`);const deadline=process.hrtime.bigint()+BigInt(limits.timeoutMs)*1000000n,raw=spawnSync(process.execPath,[new URL('../src/host/lifetime.ts',import.meta.url).pathname,String(deadline),String(limits.responseBytes)],{input:JSON.stringify({command:process.execPath,args:[entry],input,limits,cwd:root}),encoding:'utf8',maxBuffer:limits.responseBytes*12+4096});assert.equal(raw.status,0,raw.stderr);const result=JSON.parse(raw.stdout);assert.match(result.failure,/input failed/);assert.equal(result.stdout,'');assert.equal(result.stdoutBytes,'');assert.match(result.stderr,new RegExp(marker));assert.ok(Buffer.byteLength(result.stderr)<=limits.responseBytes);assert.throws(()=>boundedProcess(process.execPath,[entry],input,limits,root),error=>error instanceof Error&&error.message.includes(marker)&&error.message.includes('input failed'));}finally{rmSync(root,{recursive:true,force:true})}
});
