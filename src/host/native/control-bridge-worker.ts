/** Sealed Root control code: one fresh custodian connection per request. */
import { parentPort, workerData } from 'node:worker_threads';
import { createConnection, type Socket } from 'node:net';
const { endpoint, deadlineMs, shared, inputBytes, outputBytes } = workerData as { endpoint: { socket: string; timeoutMs: number; deadlineMs: number }; deadlineMs: number; shared: SharedArrayBuffer; inputBytes: number; outputBytes: number };
const port = parentPort;
if (!port) throw Error('REFUSE·Root control transport parent absent');
const header = new Int32Array(shared, 0, 8), input = new Uint8Array(shared, 32, inputBytes), output = new Uint8Array(shared, 32 + inputBytes, outputBytes);
const initial = Math.min(endpoint.timeoutMs, deadlineMs - Date.now());
const deadline = process.hrtime.bigint() + BigInt(Math.max(0, initial)) * 1_000_000n;
const remaining = () => Math.max(0, Number((deadline - process.hrtime.bigint() + 999_999n) / 1_000_000n));
let busy = false, red: string | undefined, active: Socket | undefined;
function finish(state: number, bytes: Uint8Array) {
 if (bytes.byteLength > outputBytes) { state = 3; bytes = Buffer.from('REFUSE·reply bytes').subarray(0, outputBytes); }
 output.set(bytes); Atomics.store(header, 3, bytes.byteLength); Atomics.store(header, 0, state); Atomics.notify(header, 0);
}
// Timer slices never widen the original monotonic deadline.
let timer: ReturnType<typeof setTimeout>;
function arm() {
 const left = remaining();
 if (left > 0) { timer = setTimeout(arm, Math.min(left, 2_147_483_647)); timer.unref(); return; }
 red ??= 'REFUSE·parent deadline'; active?.destroy(Error(red));
 if (Atomics.load(header, 0) === 1) finish(3, Buffer.from(red).subarray(0, outputBytes));
 port!.close();
}
arm();
port.on('close', () => { clearTimeout(timer); active?.destroy(); });
port.on('message', async (message: unknown) => {
 if (busy || red || message !== Atomics.load(header, 1) || Atomics.load(header, 0) !== 1) { red ??= 'REFUSE·sequence/state'; finish(3, Buffer.from(red).subarray(0, outputBytes)); return; }
 busy = true;
 try {
  const length = Atomics.load(header, 2);
  if (length < 1 || length > inputBytes) throw Error('REFUSE·request bytes');
  if (remaining() <= 0) throw Error('REFUSE·parent deadline');
  const frame = Buffer.from(input.slice(0, length));
  const bytes = await new Promise<Buffer>((resolve, reject) => {
   const socket = createConnection(endpoint.socket); active = socket;
   const chunks: Buffer[] = []; let size = 0, done = false;
   const end = (error?: Error) => { if (done) return; done = true; if (error) reject(error); else resolve(Buffer.concat(chunks)); };
   socket.once('connect', () => socket.write(Buffer.concat([frame, Buffer.from('\n')])));
   socket.on('data', chunk => { size += chunk.length; if (size > outputBytes) socket.destroy(Error('REFUSE·reply bytes')); else chunks.push(chunk); });
   socket.once('error', end); socket.once('close', () => end());
  });
  active = undefined;
  if (!bytes.length) throw Error('REFUSE·interrupted before reply');
  if (remaining() <= 0) throw Error('REFUSE·parent deadline');
  busy = false; finish(2, bytes);
 } catch (error) { active = undefined; red ??= error instanceof Error ? error.message : String(error); busy = false; finish(3, Buffer.from(red).subarray(0, outputBytes)); }
});
Atomics.store(header, 5, 1); Atomics.notify(header, 5);
