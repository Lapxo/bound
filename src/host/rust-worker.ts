import {parentPort} from 'node:worker_threads';
import {runRustCore} from '../wasm/rust-core.ts';
import type {RustCoreRequest} from '../wasm/rust-core.ts';

const port = parentPort;
if (!port) throw Error('bound/worker-port');
port.once('message', async (request: RustCoreRequest) => {
  try {
    port.postMessage({ok: true, result: await runRustCore(request)});
  } catch (error) {
    port.postMessage({ok: false, error: error instanceof Error ? error.message : 'bound/worker-failure'});
  }
});
