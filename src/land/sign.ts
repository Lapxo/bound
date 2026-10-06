import { canonical, parse, parseForSigning, signedBytes, signedFieldsOf } from '@lapxo/topos/wire';
import { signBytes, verifyBytes } from '../host/adapters/keys/ed25519.ts';

type Signed =
  | { readonly kind: 'fact'; readonly line: string }
  | { readonly kind: 'refuse'; readonly why: string };

/** A consent line (by=target, no sig) becomes the owner's claim: stamped with its epoch, then signed over the canonical bytes. */
export function signConsentLine(
  line: string,
  privateKeyPem: string,
  stamp: { readonly epoch?: number; readonly by: string; readonly algorithm: string },
): Signed {
  const got = parseForSigning(line);
  if (got.kind !== 'fact') return { kind: 'refuse', why: `REFUSE·accept not a claim line: ${got.why}` };
  const fields = got.value.fields;
  const scope = fields['scope'] ?? '?';
  if (fields['sig'] !== undefined) return { kind: 'refuse', why: `REFUSE·accept ${scope} is already signed` };
  if (fields['by'] !== 'target') {
    return { kind: 'refuse', why: `REFUSE·accept ${scope} is by=${fields['by'] ?? '∅'}; only by=target lines are signed` };
  }
  const covered = signedFieldsOf(fields, stamp.by);
  if (stamp.epoch !== undefined) covered['epoch'] = String(stamp.epoch);
  return { kind: 'fact', line: canonical({ ...covered, sig: signBytes(signedBytes(covered), privateKeyPem, stamp.algorithm) }) };
}

export function verifiesOwnerLine(line: string, publicKeyPem: string, admitted: readonly string[]): boolean {
  const got = parse(line);
  if (got.kind !== 'fact') return false;
  const { sig, ...rest } = got.value.fields;
  return typeof sig === 'string' && verifyBytes(signedBytes(rest), publicKeyPem, sig, admitted);
}

export function verifiesFields(fields: Readonly<Record<string, string>>, publicKey: string, admitted: readonly string[]): boolean {
  const { sig, ...rest } = fields;
  return typeof sig === 'string' && verifyBytes(signedBytes(rest), publicKey, sig, admitted);
}
