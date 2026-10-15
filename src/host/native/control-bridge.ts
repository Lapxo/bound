/** Root-fixed synchronous transport. It retains no grants or command results. */
import { Worker, isMainThread } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { readBoundedFile } from './bounded-file.ts';
const FixedWorker = Worker;
const HEADER_BYTES = 32;
let controlWorkerOccupied = false;
const digest = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
export interface ControlEndpoint {
 readonly socket: string; readonly timeoutMs: number; readonly deadlineMs: number; readonly responseBytes: number;
}
export interface FixedControlBinding {
 readonly endpoint: ControlEndpoint;
 readonly workerBytes: Uint8Array;
 readonly worker: { readonly digest: string; readonly coordinate: string; readonly bytes: number };
 readonly runtime: { readonly path: string; readonly digest: string; readonly bytes: number };
 readonly resources: { readonly inputBytes: number; readonly outputBytes: number; readonly sharedBytes: number };
 readonly deadlineMs: number;
}
export function createFixedControlBridge(inputBinding: FixedControlBinding) {
 // @1 is one main-thread control worker per OS process, never a WorldWorker grant.
 if (!isMainThread) throw Error('REFUSE·Root control transport requires main-thread realm');
 const refuse = (why: string): never => { throw Error('REFUSE·Root control transport ' + why); };
 const integer = (value: number) => Number.isSafeInteger(value) && value > 0;
 const sourceBytes = inputBinding.workerBytes;
 const workerSelection = Object.freeze({ ...inputBinding.worker });
 if (!(sourceBytes instanceof Uint8Array) || !workerSelection.coordinate || !integer(workerSelection.bytes) || sourceBytes.byteLength !== workerSelection.bytes)
  refuse('selected worker bytes/type bound differs before copy');
 const binding: FixedControlBinding = Object.freeze({ ...inputBinding,
  endpoint: Object.freeze({ ...inputBinding.endpoint }), resources: Object.freeze({ ...inputBinding.resources }),
  runtime: Object.freeze({ ...inputBinding.runtime }), worker: workerSelection,
  workerBytes: Buffer.from(sourceBytes) });
 const { endpoint, resources, runtime, worker: selected } = binding;
 if (!selected.coordinate || !integer(selected.bytes) || binding.workerBytes.byteLength !== selected.bytes || digest(binding.workerBytes) !== selected.digest)
  refuse('selected worker bytes differ');
 if (runtime.path !== process.execPath || !integer(runtime.bytes) || digest(readBoundedFile(runtime.path, runtime.bytes, runtime.path)) !== runtime.digest)
  refuse('selected runtime bytes differ');
 if (![endpoint.timeoutMs, endpoint.responseBytes, endpoint.deadlineMs, binding.deadlineMs].every(integer) || binding.deadlineMs > endpoint.deadlineMs)
  refuse('parent time/byte resource absent or widened');
 // host-control-transport@1 encodes each byte length in a signed Int32 cell.
 // Refuse an incompatible declaration; never wrap or clamp its bound.
 if (resources.inputBytes > 2_147_483_647 || resources.outputBytes > 2_147_483_647)
  refuse('host-control-transport@1 signed Int32 length representation');
 const sharedBytes = HEADER_BYTES + resources.inputBytes + resources.outputBytes;
 if (!Object.values(resources).every(integer) || !Number.isSafeInteger(sharedBytes) || resources.inputBytes > endpoint.responseBytes || resources.outputBytes > endpoint.responseBytes || sharedBytes > resources.sharedBytes)
  refuse('shared/input/output resource absent or exceeded');
 const remainingMs = Math.min(endpoint.timeoutMs, binding.deadlineMs - Date.now());
 if (remainingMs <= 0) refuse('parent deadline');
 const deadline = process.hrtime.bigint() + BigInt(remainingMs) * 1_000_000n;
 const remaining = () => Math.max(0, Number((deadline - process.hrtime.bigint() + 999_999n) / 1_000_000n));
 if (controlWorkerOccupied) refuse('one live main-thread control worker resource exhausted');
 let shared: SharedArrayBuffer;
 try { shared = new SharedArrayBuffer(sharedBytes); } catch { return refuse('shared resource allocation'); }
 const header = new Int32Array(shared, 0, 8), input = new Uint8Array(shared, HEADER_BYTES, resources.inputBytes), output = new Uint8Array(shared, HEADER_BYTES + resources.inputBytes, resources.outputBytes);
 // Independently sealed bytes are immutable here. A payload cannot select a path or verifier.
 const code = Buffer.from(binding.workerBytes).toString('base64');
 controlWorkerOccupied = true;
 let worker: Worker;
 try { worker = new FixedWorker(new URL('data:text/javascript;base64,' + code), { execArgv: [], env: {}, workerData: { endpoint: { ...endpoint }, deadlineMs: binding.deadlineMs, shared, inputBytes: resources.inputBytes, outputBytes: resources.outputBytes } }); } catch { controlWorkerOccupied = false; return refuse('worker construction interrupted'); }
 let termination: Promise<number> | undefined;
 const stop = () => termination ??= worker.terminate().finally(() => { controlWorkerOccupied = false; });
 worker.once('exit', () => { controlWorkerOccupied = false; });
 worker.unref();
 let red: string | undefined, closed = false, sequence = 0;
 const fail = (why: string): never => { red ??= 'REFUSE·Root control transport ' + why; void stop(); throw Error(red); };
 // Error events still need a listener when a synchronous wait prevents JS callbacks.
 worker.on('error', error => { red ??= 'REFUSE·Root control transport worker interrupted: ' + error.message; });
 if (Atomics.load(header, 5) !== 1 && Atomics.wait(header, 5, 0, remaining()) === 'timed-out') fail('startup deadline/interruption');
 return {
  exchange(frame: string): string {
   if (red) throw Error(red);
   if (closed) fail('closed');
   if (remaining() <= 0) fail('parent deadline');
   if (typeof frame !== 'string' || !frame.length || Buffer.byteLength(frame, 'utf8') > resources.inputBytes) fail('request bytes before copy');
   const bytes = Buffer.from(frame, 'utf8');
   if (Atomics.load(header, 0) !== 0 || sequence >= 2_147_483_647) fail('overlapping request/sequence');
   input.set(bytes); Atomics.store(header, 2, bytes.length); Atomics.store(header, 1, ++sequence); Atomics.store(header, 0, 1); worker.postMessage(sequence);
   if (Atomics.wait(header, 0, 1, remaining()) === 'timed-out' || remaining() <= 0) fail('deadline/interruption');
   const state = Atomics.load(header, 0), length = Atomics.load(header, 3);
   if (length < 1 || length > resources.outputBytes) fail('reply bytes');
   let reply: string;
   try { reply = new TextDecoder('utf-8', { fatal: true }).decode(output.slice(0, length)); } catch { return fail('reply encoding'); }
   if (state !== 2) fail(reply);
   Atomics.store(header, 0, 0);
   return reply;
  },
  async close() { closed = true; await stop(); }
 };
}
