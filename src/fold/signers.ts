import { existsSync, join } from '../host/io.ts';
import { authorityOf, isKeyClaim, parse, signersOf } from '@lapxo/topos/wire';
import type { Published, Signer, SignerVerdict } from '@lapxo/topos/wire';
import { verifiesFields } from '../land/sign.ts';
import { fieldOf, selfName } from './claims.ts';
import { keyFor, lockStanding } from './keys.ts';
import { storeRoot } from '../host/ports/store.ts';
import { storeOf } from '../land/ledger.ts';
import { observeText } from '../observe/files.ts';

/** A lock line about the signers: the authority fold reads it. */
export function isSignerLock(line: string): boolean {
  const got = parse(line);
  return got.kind === 'fact' && isKeyClaim(got.value.fields);
}

/** The authority view of a ledger: which signers the lock admits from its root, and what each line carries. */
export function authorityFor(lines: readonly string[], root: Signer, admitted: readonly string[], published?: Published): {
  readonly admitted: readonly Signer[];
  readonly potential: readonly string[];
  readonly of: (line: string) => SignerVerdict;
} {
  const fields = lines
    .map((line) => parse(line))
    .flatMap((got) => (got.kind === 'fact' ? [got.value.fields] : []));
  const lock = signersOf(fields, root, (f, key) => verifiesFields(f, key, admitted));
  return {
    admitted: lock.admitted,
    potential: lock.potential,
    of: (line) => {
      const got = parse(line);
      return got.kind === 'fact'
        ? authorityOf(got.value.fields, lock.admitted, (f, key) => verifiesFields(f, key, admitted), published)
        : { kind: 'grey', why: `not a claim line: ${got.why}` };
    },
  };
}

/** The key this lock admits for a class of writing: the fold is kept by whoever runs it, and the lock says who that is. */
export function writerFor(standing: readonly string[], kind: string): string | undefined {
  for (const line of standing) {
    const key = /^keys\/([^/]+)$/.exec(fieldOf(line, 'scope'))?.[1];
    if (key && fieldOf(line, 'measure') === 'class' && fieldOf(line, 'value') === kind) return key;
  }
  return undefined;
}

export function publicKeyOf(root: string, keyId: string): string | undefined {
  const at = [join(storeRoot(root), `${selfName()}.keys`), join(storeOf(root), `${selfName()}.keys`)].find((one) => existsSync(one));
  const keys = at === undefined ? {} : JSON.parse(observeText(at) ?? '{}') as Record<string, { readonly publicKey?: string }>;
  const anchored = keys[keyId]?.publicKey;
  if (anchored !== undefined) return anchored;
  const said = lockStanding(storeOf(root))
    .find((line) => fieldOf(line, 'scope') === `keys/${keyId}` && fieldOf(line, 'measure') === 'public-key' && fieldOf(line, 'value') !== 'withdraw');
  return said === undefined ? undefined : fieldOf(said, 'value');
}

export function releaseSigner(lines: readonly string[]): Signer {
  const said = (id: string, measure: string): string | undefined => fieldOf(lines.find((line) => fieldOf(line, 'scope') === `keys/${id}` && fieldOf(line, 'measure') === measure && fieldOf(line, 'value') !== 'withdraw') ?? '', 'value') || undefined;
  const id = writerFor(lines, 'authorize') ?? '';
  return { id, keyClass: 'authorize', publicKey: said(id, 'public-key') ?? '', coverage: ['*'], depth: { lo: 1, hi: 16 }, admittedBy: [] };
}

export function rootSigner(root: string): { id: string; keyClass: 'authorize'; publicKey: string; coverage: string[]; depth: { lo: number; hi: number }; admittedBy: string[] } {
  const id = keyFor(storeOf(root), 'authorize');
  return { id, keyClass: 'authorize', publicKey: publicKeyOf(root, id) ?? '', coverage: ['*'], depth: { lo: 1, hi: 16 }, admittedBy: [] };
}
