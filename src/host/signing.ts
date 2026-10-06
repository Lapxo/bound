import { readFileSync } from 'node:fs';
import { parse, signerSelection, signerRequestBytes, signerResponseBytes, signerResponseOf } from '@lapxo/topos/wire';
import { invokeSigner, SigningFailure } from './ports/signing.ts';
import type { SigningLot, SigningMechanism } from './ports/signing.ts';

/** An explicitly supplied host registry; a repository cannot supply executable bindings. */
function binding(name: string, keyFile?: string): SigningMechanism {
  if (name === 'file') {
    if (!keyFile) throw new SigningFailure('REFUSE·signer file needs --key-file');
    return { kind: 'file', path: keyFile };
  }
  if (keyFile) throw new SigningFailure('REFUSE·signer command cannot use --key-file');
  const path = process.env['BOUND_SIGNERS'];
  if (!path) throw new SigningFailure('REFUSE·signer no host binding registry');
  try {
    const registry: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!registry || typeof registry !== 'object' || !Object.prototype.hasOwnProperty.call(registry, name)) throw Error();
    const record = (registry as Record<string, unknown>)[name];
    if (!record || typeof record !== 'object') throw Error();
    const f = record as Record<string, unknown>;
    if (f['kind'] !== 'command' || typeof f['executable'] !== 'string' || !f['executable']
      || !Array.isArray(f['args']) || !f['args'].every(a => typeof a === 'string')) throw Error();
    return { kind: 'command', executable: f['executable'], args: f['args'] as string[] };
  } catch { throw new SigningFailure('REFUSE·signer host binding unavailable or invalid'); }
}

/** Resolve data before acquisition; all mechanisms use one wire protocol and verification path. */
export function signerFor(lines: readonly string[], keyId: string, selected?: string, keyFile?: string) {
  const fields = lines.flatMap(line => { const got = parse(line); return got.kind === 'fact' ? [got.value.fields] : []; });
  const declaration = signerSelection(fields, keyId);
  if (selected !== undefined && selected !== declaration.name) throw new SigningFailure(`REFUSE·signer ${keyId} CLI selection conflicts with declaration`);
  const mechanism = binding(declaration.name, keyFile);
  const protocol = { request: signerRequestBytes, response: signerResponseBytes, reply: signerResponseOf };
  return (lot: SigningLot) => invokeSigner(lot, mechanism, protocol, declaration);
}
