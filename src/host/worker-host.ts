import {openSync,closeSync,fstatSync,readSync} from 'node:fs';
import {refuseBound as refuse} from './refusals.ts';
import {Worker} from 'node:worker_threads';
import {evaluateWasm} from '../wasm/adapter.ts';
import type {WasmRequest, WasmResult} from '../wasm/adapter.ts';
import {checkRustCoreRequest} from '../wasm/rust-core.ts';
import type {RustCoreRequest} from '../wasm/rust-core.ts';

export interface BoundWorkerOptions {
  readonly lifetimeMs: number;
  readonly signal?: AbortSignal;
}

function worker(entry: URL): Worker {
  return new Worker(entry, {execArgv: [], env: {}});
}

export function evaluateBoundCapsuleInWorker(request: WasmRequest, options: BoundWorkerOptions): Promise<WasmResult> {
  return evaluateWasm(request, {...options, workerFactory: () => worker(new URL('../wasm/node-worker.js', import.meta.url))});
}

export async function evaluateBoundCoreInWorker(
  request: RustCoreRequest, {lifetimeMs, signal}: BoundWorkerOptions,
): Promise<Uint8Array> {
  checkRustCoreRequest(request);
  const {operation, prepared, wasm, trusted: {digest, byteLength}} = request;
  return runBoundByteWorker(new URL('./rust-worker.js', import.meta.url),
    {operation, prepared: Uint8Array.from(prepared), wasm: Uint8Array.from(wasm), trusted: {digest, byteLength}}, {lifetimeMs,signal});
}

/** Termination completes before releasing the receiver's enclosing lock. */
export async function runBoundByteWorker(entry:URL, request:unknown, {lifetimeMs,signal}:BoundWorkerOptions, drain=false):Promise<Uint8Array>{
  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 2147483647) throw Error('fold/worker-lifetime');
  if (signal?.aborted) throw Error('fold/cancelled');
  return new Promise((resolve, reject) => {
    const thread = worker(entry);
    let done = false, expired=false;
    function finish(error: Error | null, result?: Uint8Array): void {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      void thread.terminate().then(()=>error||expired?reject(error??Error('fold/worker-lifetime')):resolve(result!),reject);
    }
    const abort = () => finish(Error('fold/cancelled'));
    const timer = setTimeout(() => {if(drain)expired=true;else finish(Error('fold/worker-lifetime'));}, lifetimeMs);
    thread.once('error', error => finish(error instanceof Error ? error : Error(String(error))));
    thread.once('messageerror', () => finish(Error('fold/worker-result')));
    thread.once('exit', () => finish(Error('fold/worker-exit')));
    thread.once('message', (message: unknown) => {
      if (message && typeof message === 'object' && 'ok' in message) {
        if (message.ok === true && 'result' in message && message.result instanceof Uint8Array) {
          finish(null, message.result);
          return;
        }
        if (message.ok === false && 'error' in message && typeof message.error === 'string') {
          finish(Error(message.error));
          return;
        }
      }
      finish(Error('fold/worker-result'));
    });
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) return abort();
    try {
      thread.postMessage(request);
    } catch {
      finish(Error('fold/worker-request'));
    }
  });
}

export const installedRustCore=Object.freeze({
 digest:'sha256:556acc32103d8d185a0f2a862a0c242852141cbdf7fc331e2a69d2ca5ef9586b',
 byteLength:251481,
});
function readModule():Uint8Array{
 const fd=openSync(new URL('../../assets/wasm/bound-core.wasm',import.meta.url),'r');
 try{
  const stat=fstatSync(fd);
  if(!stat.isFile()||stat.size!==installedRustCore.byteLength)refuse('fold/module-selection');
  const bytes=new Uint8Array(installedRustCore.byteLength);
  let offset=0;
  while(offset<bytes.length){
   const got=readSync(fd,bytes,offset,bytes.length-offset,null);
   if(!got)refuse('fold/module-selection');
   offset+=got;
  }
  return bytes;
 }finally{closeSync(fd)}
}

export async function evaluateInstalledBoundCoreInWorker(
  request: Pick<RustCoreRequest,'operation'|'prepared'>, options: BoundWorkerOptions,
): Promise<Uint8Array> {
  if (options.signal?.aborted) refuse('fold/cancelled');
  return evaluateBoundCoreInWorker({...request,wasm:readModule(),trusted:installedRustCore},options);
}
