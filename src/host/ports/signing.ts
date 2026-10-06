import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { signBytes } from '../adapters/keys/ed25519.ts';

/** Contains only host-controlled diagnostics, never child output. */
export class SigningFailure extends Error {}

export interface SigningLot {
  readonly bytes: readonly string[];
  readonly keyId: string;
  readonly algorithm: string;
}

export interface SignatureRecord { readonly keyId: string; readonly signature: string }
export interface SigningProtocol {
  readonly request: (lot: SigningLot) => string;
  readonly response: (records: readonly SignatureRecord[]) => string;
  readonly reply: (text: string, lot: SigningLot) => readonly SignatureRecord[];
}
export type SigningMechanism =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'command'; readonly executable: string; readonly args: readonly string[] };
export interface SigningLimits { readonly timeoutMs: number; readonly responseBytes: number }

/** Host-approved mechanism only. Repository declarations do not authorize execution. */
export async function invokeSigner(lot: SigningLot, mechanism: SigningMechanism,
  protocol: SigningProtocol, limits: SigningLimits): Promise<readonly SignatureRecord[]> {
  if (!Number.isSafeInteger(limits.timeoutMs) || limits.timeoutMs <= 0
    || !Number.isSafeInteger(limits.responseBytes) || limits.responseBytes <= 0) {
    throw new SigningFailure(`REFUSE·signer ${lot.keyId} has no valid declared limits`);
  }
  const request = protocol.request(lot);
  let output: string;
  if (mechanism.kind === 'file') {
    try {
      const key = readFileSync(mechanism.path, 'utf8');
      output = protocol.response(lot.bytes.map(bytes => ({ keyId: lot.keyId, signature: signBytes(bytes, key, lot.algorithm) })));
    } catch {
      throw new SigningFailure(`REFUSE·signer ${lot.keyId} file mechanism failed`);
    }
  } else output = await new Promise<string>((resolve, reject) => {
    const child = spawn(mechanism.executable, [...mechanism.args], { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let size = 0;
    const chunks: Buffer[] = [];
    let failure: string | undefined;
    const refuse = (why: string) => {
      if (failure) return;
      failure = why;
      child.kill('SIGKILL');
      clearTimeout(timer);
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      reject(new SigningFailure(`REFUSE·signer ${lot.keyId} ${why} · status=none · signal=SIGKILL`));
    };
    const timer = setTimeout(() => refuse('timeout'), limits.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limits.responseBytes) refuse('response exceeds declared limit');
      if (!failure) chunks.push(chunk);
    });
    // Drain, never forward or retain signer diagnostics.
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => refuse('input delivery failed'));
    child.on('error', () => {
      clearTimeout(timer);
      reject(new SigningFailure(`REFUSE·signer ${lot.keyId} command could not start`));
    });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      if (failure || status !== 0) {
        reject(new SigningFailure(`REFUSE·signer ${lot.keyId} ${failure ?? 'command failed'} · status=${status ?? 'none'} · signal=${signal ?? 'none'}`));
      } else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.end(request);
  });
  if (Buffer.byteLength(output) > limits.responseBytes) throw new SigningFailure(`REFUSE·signer ${lot.keyId} response exceeds declared limit`);
  try { return protocol.reply(output, lot); }
  catch { throw new SigningFailure(`REFUSE·signer ${lot.keyId} invalid response`); }
}
