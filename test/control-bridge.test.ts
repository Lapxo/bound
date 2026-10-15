import test from 'node:test'; import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads'; import { readFileSync } from 'node:fs'; import { createHash } from 'node:crypto'; import { stripTypeScriptTypes } from 'node:module';
import { createFixedControlBridge, type FixedControlBinding } from '../src/host/native/control-bridge.ts';
const sha = (raw: Uint8Array) => 'sha256:' + createHash('sha256').update(raw).digest('hex');
const workerBytes = Buffer.from(stripTypeScriptTypes(readFileSync(new URL('../src/host/native/control-bridge-worker.ts', import.meta.url), 'utf8'), { mode: 'strip' }));
const runtimeBytes = readFileSync(process.execPath);
async function fixture(mode?: string) {
 const worker = new Worker(new URL(mode ? './control-bridge-boundary-server.ts' : './control-bridge-server.ts', import.meta.url), { workerData: { mode }, execArgv: [] });
 const data = await new Promise<any>((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
 const endpoint = mode ? data : data.endpoint, cap = endpoint.responseBytes;
 const binding: FixedControlBinding = { endpoint, workerBytes, worker: { coordinate: 'executor/control-worker', digest: sha(workerBytes), bytes: workerBytes.length }, runtime: { path: process.execPath, digest: sha(runtimeBytes), bytes: runtimeBytes.length }, resources: { inputBytes: cap, outputBytes: cap, sharedBytes: 32 + 2 * cap }, deadlineMs: endpoint.deadlineMs };
 return { data, binding, usage: () => new Promise<any>(resolve => { worker.once('message', reply => resolve(reply.usage)); worker.postMessage('usage'); }), async close() { worker.postMessage('close'); await new Promise(resolve => worker.once('exit', resolve)); } };
}
const frame = (f: any, request: unknown) => JSON.stringify({ protocol: 'command-lot/1', coordinate: f.endpoint.coordinate, implementation: f.endpoint.implementation, identity: f.endpoint.identity, requests: [JSON.stringify(request)] });
test('fixed host transport uses the actual custodian on every call and keeps its charges', async () => {
 const f = await fixture(); let bridge;
 try { bridge = createFixedControlBridge(f.binding); for (let i = 1; i <= 5; i++) { const reply = JSON.parse(bridge.exchange(frame(f.data, f.data.request))); assert.equal(reply.responses[0].kind, 'entry-context'); assert.equal(reply.responses[0].usage.work, i); }
  const refuse = JSON.parse(bridge.exchange(frame(f.data, { ...f.data.request, token: 'wrong' }))); assert.equal(refuse.responses[0].kind, 'refuse'); assert.match(refuse.responses[0].why, /capability/);
  const repeated = JSON.parse(bridge.exchange(frame(f.data, f.data.request))); assert.equal(repeated.responses[0].kind, 'refuse'); assert.match(repeated.responses[0].why, /capability/);
 } finally { await bridge?.close(); await f.close(); }
});
for (const mode of ['malformed', 'identity', 'oversize', 'interrupted', 'timeout']) test('fixed control transport keeps raw/refused boundary ' + mode, async () => {
 const f = await fixture(mode); let bridge;
 try { bridge = createFixedControlBridge(f.binding);
  if (mode === 'malformed') { const raw = bridge.exchange('{}'); assert.throws(() => JSON.parse(raw)); }
  else if (mode === 'identity') { const raw = bridge.exchange('{}'); assert.equal(JSON.parse(raw).coordinate, 'wrong'); }
  else { const refusal = mode === 'oversize' ? /reply bytes/ : mode === 'timeout' ? /deadline|interruption/ : /interrupted/; assert.throws(() => bridge.exchange('{}'), refusal); assert.throws(() => bridge.exchange('{}'), refusal); }
 } finally { await bridge?.close(); await f.close(); }
});
test('fixed control transport refuses unsealed bytes, widened/absent resources and closed lifecycle', async () => {
 const f = await fixture('timeout'); let bridge;
 try {
  assert.throws(() => createFixedControlBridge({ ...f.binding, workerBytes: Buffer.from('different') }), /worker bytes/);
  assert.throws(() => createFixedControlBridge({ ...f.binding, runtime: { ...f.binding.runtime, digest: 'sha256:' + '0'.repeat(64) } }), /runtime bytes/);
  assert.throws(() => createFixedControlBridge({ ...f.binding, resources: { ...f.binding.resources, sharedBytes: 1 } }), /resource/);
  assert.throws(() => createFixedControlBridge({ ...f.binding, resources: { ...f.binding.resources, outputBytes: f.binding.endpoint.responseBytes + 1 } }), /resource/);
  assert.throws(() => createFixedControlBridge({ ...f.binding, deadlineMs: f.binding.deadlineMs + 1 }), /time/);
  bridge = createFixedControlBridge(f.binding); assert.throws(() => bridge.exchange('x'.repeat(f.binding.resources.inputBytes + 1)), /request bytes/); await bridge.close();
  bridge = createFixedControlBridge(f.binding); await bridge.close(); assert.throws(() => bridge.exchange('{}'), /closed/);
 } finally { await bridge?.close(); await f.close(); }
});
test('control @1 refuses unrepresentable signed-header caps before allocation', async () => {
 const f=await fixture('timeout');try {
  const large=2_147_483_648;
  assert.throws(()=>createFixedControlBridge({...f.binding,endpoint:{...f.binding.endpoint,responseBytes:large},resources:{inputBytes:large,outputBytes:1,sharedBytes:large+33}}),/signed Int32 length representation/);
  assert.throws(()=>createFixedControlBridge({...f.binding,endpoint:{...f.binding.endpoint,responseBytes:large},resources:{inputBytes:1,outputBytes:large,sharedBytes:large+33}}),/signed Int32 length representation/);
 }finally{await f.close();}
});
test('the retained transport budget is unaffected by external descriptor mutation', async () => {
 const f=await fixture('timeout');let bridge;try {
  const originalDeadline=f.binding.endpoint.deadlineMs,originalCap=f.binding.resources.inputBytes;
  bridge=createFixedControlBridge(f.binding);
  Object.assign(f.binding.resources,{inputBytes:originalCap*2,outputBytes:originalCap*2,sharedBytes:originalCap*4+32});
  Object.assign(f.binding.endpoint,{timeoutMs:100000,deadlineMs:originalDeadline+100000,responseBytes:originalCap*2});
  Object.assign(f.binding,{deadlineMs:originalDeadline+100000});
  assert.throws(()=>bridge.exchange('x'.repeat(originalCap+1)),/request bytes/);
 }finally{await bridge?.close();await f.close();}
});
test('parent process-group interruption kills a child waiting on the control worker',async()=>{
 const {boundedProcess}=await import('../src/host/process-lifetime.ts');const {mkdtempSync,rmSync,existsSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const f=await fixture('timeout'),dir=mkdtempSync(join(tmpdir(),'control-cancel-')),pidFile=join(dir,'pid');
 try{
  assert.throws(()=>boundedProcess(process.execPath,[new URL('./control-bridge-wait-child.ts',import.meta.url).pathname],JSON.stringify({binding:f.binding,workerBytes:workerBytes.toString('base64'),pidFile}),{timeoutMs:700,responseBytes:8192}),/declared timeout exhausted/);
  assert.ok(existsSync(pidFile),'the owned child constructed its fixed worker and reached the waiting exchange');
  const pid=Number(readFileSync(pidFile,'utf8'));assert.throws(()=>process.kill(pid,0),error=>(error as NodeJS.ErrnoException).code==='ESRCH');
 }finally{await f.close();rmSync(dir,{recursive:true,force:true});}
});
test('two actual Worker realms retain the existing fixed client and the same aggregate custodian',async()=>{
 const f=await fixture();let bridge;try{
  bridge=createFixedControlBridge(f.binding);assert.equal(JSON.parse(bridge.exchange(frame(f.data,f.data.request))).responses[0].usage.work,1);
  const workers=[0,1].map(()=>new Worker(new URL('./control-bridge-realm-child.ts',import.meta.url),{execArgv:[],workerData:{binding:f.binding,workerBytes:workerBytes.toString('base64'),frame:frame(f.data,f.data.request)}}));
  const replies=await Promise.all(workers.map(w=>new Promise<any>((resolve,reject)=>{w.once('message',resolve);w.once('error',reject)})));
  for(const reply of replies){assert.equal(reply.isMainThread,false);assert.match(reply.refusal,/requires main-thread realm/);assert.equal(reply.status,0,reply.stderr);assert.equal(JSON.parse(reply.reply).responses[0].kind,'entry-context');}
  // Connections are charged on acceptance: concurrent replies may both see 3.
  for(const reply of replies)assert.ok([2,3].includes(JSON.parse(reply.reply).responses[0].usage.work));
  assert.equal((await f.usage()).work,3,'one initial request plus two concurrent realms share exactly three charges');
  await Promise.all(workers.map(w=>w.terminate()));
 }finally{await bridge?.close();await f.close();}
});
test('one live main-thread control worker refuses double construction and releases after close',async()=>{
 const f=await fixture('timeout');let first,second;try{first=createFixedControlBridge(f.binding);assert.throws(()=>createFixedControlBridge(f.binding),/one live main-thread/);await first.close();second=createFixedControlBridge(f.binding);}finally{await first?.close();await second?.close();await f.close();}
});
test('worker and UTF-8 request budgets refuse before copying their payload',async t=>{
 const f=await fixture('timeout');let bridge;try{
  const oversized=Buffer.concat([workerBytes,Buffer.from('extra')]);let copies=0;
  const originalFrom=Buffer.from;
  let mock=t.mock.method(Buffer,'from',function(...args:any[]){if(args[0]===oversized)copies++;return Reflect.apply(originalFrom,Buffer,args);});
  assert.throws(()=>createFixedControlBridge({...f.binding,workerBytes:oversized}),/before copy/);assert.equal(copies,0);mock.mock.restore();
  bridge=createFixedControlBridge(f.binding);const frame='💬'.repeat(Math.floor(f.binding.resources.inputBytes/4)+1);copies=0;
  mock=t.mock.method(Buffer,'from',function(...args:any[]){if(args[0]===frame)copies++;return Reflect.apply(originalFrom,Buffer,args);});
  assert.throws(()=>bridge.exchange(frame),/before copy/);assert.equal(copies,0);mock.mock.restore();
 }finally{await bridge?.close();await f.close();}
});
