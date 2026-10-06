import { canonical, parse, parseForSigning, signedBytes, signedFieldsOf } from '@lapxo/topos/wire';
import { verifyBytes } from '../host/adapters/keys/ed25519.ts';
import { SigningFailure } from '../host/ports/signing.ts';
import type { SigningLot, SignatureRecord } from '../host/ports/signing.ts';

type Prepared = { readonly kind: 'fact'; readonly fields: Record<string, string> } | { readonly kind: 'refuse'; readonly why: string };

function prepareConsentLine(line: string, stamp: { readonly epoch?: number; readonly by: string }): Prepared {
  const got = parseForSigning(line);
  if (got.kind !== 'fact') return { kind: 'refuse', why: 'REFUSE·accept not a claim line' };
  const fields = got.value.fields;
  const scope = fields['scope'] ?? '?';
  if (fields['sig'] !== undefined) return { kind: 'refuse', why: `REFUSE·accept ${scope} is already signed` };
  if (fields['by'] !== 'target') return { kind: 'refuse', why: `REFUSE·accept ${scope} must be drafted by=target` };
  const covered = signedFieldsOf(fields, stamp.by);
  if (stamp.epoch !== undefined) covered['epoch'] = String(stamp.epoch);
  return { kind: 'fact', fields: covered };
}

/** Prepare and verify a whole lot. No key material and no output/admission side effects. */
export async function signConsentLot(lines: readonly string[],
  stamp: { readonly epoch?: number; readonly by: string; readonly algorithm: string },
  publicKey: string, admitted: readonly string[],
  invoke: (lot: SigningLot) => Promise<readonly SignatureRecord[]>): Promise<
  { readonly kind: 'fact'; readonly lines: readonly string[] } | { readonly kind: 'refuse'; readonly why: string }> {
  const fields: Record<string, string>[] = [];
  for (const line of lines) {
    const prepared = prepareConsentLine(line, stamp);
    if (prepared.kind === 'refuse') return prepared;
    fields.push(prepared.fields);
  }
  if (!fields.length) return { kind: 'refuse', why: `REFUSE·signer ${stamp.by} empty lot` };
  let records: readonly SignatureRecord[];
  try { records = await invoke({ bytes: fields.map(f => signedBytes(f)), keyId: stamp.by, algorithm: stamp.algorithm }); }
  catch (error) { return { kind: 'refuse', why: error instanceof SigningFailure ? error.message : `REFUSE·signer ${stamp.by} acquisition failed` }; }
  if (records.length !== fields.length || records.some((record, i) => record.keyId !== stamp.by
    || !verifyBytes(signedBytes(fields[i]!), publicKey, record.signature, admitted))) {
    return { kind: 'refuse', why: `REFUSE·signer ${stamp.by} signature does not verify` };
  }
  return { kind: 'fact', lines: fields.map((f, i) => canonical({ ...f, sig: records[i]!.signature })) };
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
