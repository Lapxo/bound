import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { formatSignature, parseSignature } from '@lapxo/topos/wire';

/**
 * The act of signing: canonical bytes, a private key and the algorithm the wire names for this era in; a signature
 * value out, whose form is the algebra's. The host runs the act and knows no name: which algorithms a signature may
 * carry, this era's and the ones the lines before it were signed under, is told by whoever read the lock.
 */
export const signBytes = (bytes: string, privateKeyPem: string, algorithm: string): string => formatSignature(algorithm, sign(null, Buffer.from(bytes, 'utf8'), createPrivateKey(privateKeyPem)).toString('base64'));

/** A public key as the lock carries it: base64 SPKI. A PEM is accepted where a tree still holds one. */
function publicKeyOf(publicKey: string) {
  return publicKey.startsWith('-----')
    ? createPublicKey(publicKey)
    : createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
}

export function verifyBytes(bytes: string, publicKeyPem: string, signature: string, admitted: readonly string[]): boolean {
  const value = parseSignature(signature);
  if (!value || !admitted.includes(value.algorithm)) return false;
  const raw = Buffer.from(value.raw, 'base64');
  if (raw.length === 0) return false;
  try {
    return verify(null, Buffer.from(bytes, 'utf8'), publicKeyOf(publicKeyPem), raw);
  } catch (err) {
    if (err instanceof Error) return false;
    throw err;
  }
}
