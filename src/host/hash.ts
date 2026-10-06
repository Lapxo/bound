import { createHash } from 'node:crypto';

/** SHA-256 byte hashing for host formats that explicitly name this algorithm. */
export const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
