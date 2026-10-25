import { createHash } from 'node:crypto';
import { byBytes } from '@lapxo/topos/wire';
import { selfName } from '../fold/claims.ts';

/** Sorted by UTF-8 bytes; the algorithm is a field (`sha256:…`), never bare hex. */
export function fullDigest(input: string | readonly string[], algorithm: string): string {
  if (!algorithm) throw new Error(`${selfName()}: REFUSE·runtime a digest was asked for before the lock said which algorithm`);
  const text = typeof input === 'string' ? input : [...input].sort(byBytes).join('\n');
  return `${algorithm}:${createHash(algorithm).update(text).digest('hex')}`;
}

export function bytesDigest(bytes: Uint8Array, algorithm: string): string {
  if (!algorithm) throw new Error(`${selfName()}: REFUSE·runtime a digest was asked for before the lock said which algorithm`);
  return `${algorithm}:${createHash(algorithm).update(bytes).digest('hex')}`;
}
