import {parentPort} from 'node:worker_threads';
import {runWasmRequest} from './adapter.ts';
import type {WasmRequest} from './adapter.ts';
if (!parentPort) throw Error('REFUSE·wasm worker port missing');
const port = parentPort;
port.once('message', async (request: WasmRequest) => {
  try { port.postMessage({ok:true,result:await runWasmRequest(request)}); }
  catch (error) { port.postMessage({ok:false,error:error instanceof Error?error.message:String(error)}); }
});
