import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {canonical} from '@lapxo/topos/wire';
import {transportBytes} from '../src/host/ports/transport.ts';
import {resolveSelectedContent} from '../src/host/source-content.ts';
const row=(scope:string,measure:string,value:string,form='alphabet')=>canonical({scope,measure,value,form,role:'writes'});
const hash=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
test('registered transports preserve raw bytes, refuse failures and never store a mismatched payload',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-transport-')),registry=join(temp,'registry.json'),entry=join(temp,'run.mjs'),previous=process.env.BOUND_TRANSPORTS,previousProbe=process.env.BOUND_ENV_PROBE;
 process.env.BOUND_TRANSPORTS=registry;process.env.BOUND_ENV_PROBE="private-host-value";
 const payload=Buffer.from([0,255,128,10,0]),digest=hash(payload),cache=new Map<string,Uint8Array>();
 try{
  writeFileSync(registry,JSON.stringify({local:{kind:'command',executable:process.execPath,args:[entry]}}));
  const policy=[row('wire/transport','id','content-request/1'),row('transport/timeout','milliseconds','0..300','interval'),row('transport/response-bytes','bytes','0..8192','interval'),row('transport/alpha','id','local'),row('transport/beta','id','local')];
  writeFileSync(entry,`import{readFileSync}from'node:fs';const r=JSON.parse(readFileSync(0,'utf8'));if(r.protocol!=='content-request/1')process.exit(9);if(process.env.BOUND_ENV_PROBE!==undefined)process.exit(8);process.stdout.write(Buffer.from(${JSON.stringify([...payload])}));`);
  for(const scheme of ['alpha','beta'])assert.deepEqual(Buffer.from(await transportBytes(`${scheme}:held`,digest,policy)),payload);
  await assert.rejects(()=>transportBytes('missing:held',digest,policy),/missing or conflicting transport\/missing/);
  const closure=[row('uses/world','digest',digest),row('sources/world','id','alpha:held')];
  const port={algorithms:new Set(['sha256']),read:(name:string)=>cache.get(name),write:(name:string,bytes:Uint8Array)=>{cache.set(name,bytes);},fetch:(location:string,name?:string)=>transportBytes(location,name!,policy)};
  await resolveSelectedContent(closure,port,[digest]);assert.deepEqual(Buffer.from(cache.get(digest)!),payload);
  cache.clear();writeFileSync(entry,"process.stdout.write('different bytes');");await assert.rejects(()=>resolveSelectedContent(closure,port,[digest]),/content hash mismatch/);assert.equal(cache.size,0);
  writeFileSync(entry,"process.stdout.write('partial');setInterval(()=>{},1000);");await assert.rejects(()=>resolveSelectedContent(closure,port,[digest]),/declared timeout exhausted/);assert.equal(cache.size,0);
  writeFileSync(entry,"process.stdout.write('valid-looking');process.exitCode=7;");await assert.rejects(()=>resolveSelectedContent(closure,port,[digest]),/status 7/);assert.equal(cache.size,0);
  writeFileSync(entry,"process.stdout.write('x'.repeat(16384));");await assert.rejects(()=>resolveSelectedContent(closure,port,[digest]),/response exceeds declared/);assert.equal(cache.size,0);
  writeFileSync(registry,'{}');await assert.rejects(()=>transportBytes('alpha:held',digest,policy),/host binding unavailable/);
 }finally{if(previousProbe===undefined)delete process.env.BOUND_ENV_PROBE;else process.env.BOUND_ENV_PROBE=previousProbe;if(previous===undefined)delete process.env.BOUND_TRANSPORTS;else process.env.BOUND_TRANSPORTS=previous;rmSync(temp,{recursive:true,force:true});}
});
