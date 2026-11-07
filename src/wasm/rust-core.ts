import {digest} from './adapter.ts';

export interface RustCoreRequest {
  readonly operation: 'fold' | 'views' | 'history';
  readonly prepared: Uint8Array;
  readonly wasm: Uint8Array;
  readonly trusted: {readonly digest: string; readonly byteLength: number};
}

const byteLimit = 65536;
export const historyLimit = 1048576;

export function checkRustCoreRequest(request: RustCoreRequest): void {
  const {operation, prepared, wasm, trusted} = request;
  if (operation !== 'fold' && operation !== 'views' && operation !== 'history') throw Error('fold/operation');
  if (!(prepared instanceof Uint8Array) || !(prepared.buffer instanceof ArrayBuffer)) throw Error('fold/input-bytes');
  if (prepared.byteLength < 1 || prepared.byteLength > (operation === 'history' ? historyLimit : byteLimit)) throw Error('fold/input-budget');
  if (!(wasm instanceof Uint8Array) || !(wasm.buffer instanceof ArrayBuffer) ||
      !trusted || !/^sha256:[a-f0-9]{64}$/.test(trusted.digest) ||
      wasm.byteLength < 1 || wasm.byteLength !== trusted.byteLength) throw Error('fold/module-selection');
}

export interface CoreExports {
  memory: WebAssembly.Memory;
  fold_abi_version(): number;
  fold_alloc(length: number): number;
  fold_length(handle: number): number;
  fold_pointer(handle: number): number;
  fold_free(handle: number, length: number): number;
  fold_eval(handle: number, length: number): bigint;
  views_eval(handle: number, length: number): bigint;
  history_append(handle: number, length: number): number;
  history_finish(): number;
  history_next(): bigint;
}

export function buffer(core: CoreExports, handle: number, length: number): Uint8Array {
  if (!Number.isInteger(handle) || handle <= 0 || length <= 0 || length > byteLimit ||
      core.fold_length(handle) !== length) throw Error('fold/abi-buffer');
  const pointer = core.fold_pointer(handle);
  if (pointer <= 0 || pointer + length > core.memory.buffer.byteLength) throw Error('fold/abi-buffer');
  return new Uint8Array(core.memory.buffer, pointer, length);
}

export function input<T>(core: CoreExports, bytes: Uint8Array, evaluate: (handle: number, length: number) => T): T {
  const handle = core.fold_alloc(bytes.length);
  try {
    buffer(core, handle, bytes.length).set(bytes);
    return evaluate(handle, bytes.length);
  } finally {
    core.fold_free(handle, bytes.length);
  }
}

export function output(core: CoreExports, packed: bigint): Uint8Array {
  const handle = Number(packed >> 32n);
  const size = Number(packed & 0xffffffffn);
  try {
    return buffer(core, handle, size).slice();
  } finally {
    core.fold_free(handle, size);
  }
}

export function runHistory(core: CoreExports, prepared: Uint8Array, finish = core.history_finish): Uint8Array {
  if ([core.history_append, finish, core.history_next].some(fn => typeof fn !== 'function')) {
    throw Error('fold/module-abi');
  }
  for (let at = 0; at < prepared.length; at += byteLimit) {
    if (input(core, prepared.subarray(at, at + byteLimit), core.history_append) !== 1) throw Error('fold/input-budget');
  }
  const length = finish();
  if (!Number.isInteger(length) || length < 1 || length > historyLimit) throw Error('fold/response-budget');
  const result = new Uint8Array(length);
  let at = 0;
  while (at < length) {
    const block = output(core, core.history_next());
    if (block.length > length - at) throw Error('fold/response-budget');
    result.set(block, at);
    at += block.length;
  }
  if (core.history_next() !== 0n) throw Error('fold/response-budget');
  return result;
}

// Prepared projections are computation inputs. Authentication and admission are host decisions.
export async function runRustCore(request: RustCoreRequest): Promise<Uint8Array> {
  checkRustCoreRequest(request);
  const {operation, wasm, prepared, trusted} = request;
  if (await digest(wasm) !== trusted.digest) throw Error('fold/module-integrity');
  const module = await WebAssembly.compile(Uint8Array.from(wasm));
  if (WebAssembly.Module.imports(module).length) throw Error('fold/module-imports');
  const {exports} = await WebAssembly.instantiate(module);
  const core = exports as unknown as CoreExports;
  const evaluate = operation === 'fold' ? core.fold_eval : core.views_eval;
  if (!(core.memory instanceof WebAssembly.Memory) || typeof evaluate !== 'function' ||
      core.fold_abi_version?.() !== 2) throw Error('fold/module-abi');

  return operation === 'history' ? runHistory(core, prepared) : output(core, input(core, prepared, evaluate));
}
