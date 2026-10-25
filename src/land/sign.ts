import { topos_wire_canonical as canonical, topos_wire_parse as parse, topos_wire_parseForSigning as parseForSigning, topos_wire_signedBytes as signedBytes, topos_wire_signedFieldsOf as signedFieldsOf } from "../../vendor/library.js";
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

// Only the cryptographic predicate is retained, never admission or coverage.
// Frozen wire fields contain exact observed record bytes; a changed record is
// a different parser value. The current key and signature vocabulary are also
// required to match, and mutable caller-owned fields are checked every time.
const verifiedFields = new WeakMap<Readonly<Record<string,string>>, {readonly publicKey:string;readonly algorithms:string;readonly valid:boolean}>();
export function verifiesFields(fields: Readonly<Record<string, string>>, publicKey: string, admitted: readonly string[]): boolean {
  const algorithms=JSON.stringify(admitted),held=verifiedFields.get(fields);
  if(held&&held.publicKey===publicKey&&held.algorithms===algorithms)return held.valid;
  // An entry exists only after the complete frozen-data proof below. Freezing
  // is irreversible, so matching inputs need not repeat that proof either.
  const immutable=held!==undefined||Object.isFrozen(fields)&&Object.prototype.hasOwnProperty.call(fields,'sig')&&Object.values(Object.getOwnPropertyDescriptors(fields)).every(field=>'value'in field&&typeof field.value==='string');
  const { sig, ...rest } = fields;
  const valid=typeof sig === 'string' && verifyBytes(signedBytes(rest), publicKey, sig, admitted);
  if(immutable)verifiedFields.set(fields,{publicKey,algorithms,valid});
  return valid;
}
