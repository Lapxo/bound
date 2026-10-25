import { ENVELOPE } from '@lapxo/topos/wire';
import { fieldsOf } from '../fold/claims.ts';
import { declaredConfig as declared } from '@lapxo/topos/forms';

/** A withdrawal takes every held line that states each field it states, its value and envelope aside. The signer's name is the envelope: a key whose coverage holds the scope takes a standing line of it, whoever signed that line. */
function takes(withdraw: string, line: string): boolean {
  const w = fieldsOf(withdraw);
  const f = fieldsOf(line);
  return Object.keys(w).filter((k) => !ENVELOPE.has(k) && k !== 'value').every((k) => f[k] === w[k]);
}

interface Withdrawal {
  /** The held lines the withdrawals take. */
  readonly taken: readonly string[];
  /** Taken lines whose scale is distributive: withdrawing them loses nothing and keeps nothing. */
  readonly exact: readonly string[];
  readonly inexact: readonly string[];
  readonly open: readonly string[];
}

export function retractedTogether(signed: readonly string[]): readonly { readonly withdraw: string; readonly line: string }[] {
  const withdraws = signed.filter((line) => fieldsOf(line)['value'] === 'withdraw');
  const claims = signed.filter((line) => fieldsOf(line)['value'] !== 'withdraw');
  return withdraws.flatMap((withdraw) => claims.filter((line) => takes(withdraw, line)).map((line) => ({ withdraw, line })));
}

export function withdrawal(withdraws: readonly string[], held: readonly string[]): Withdrawal {
  const taken = held.filter((line) => fieldsOf(line)['value'] !== 'withdraw' && withdraws.some((w) => takes(w, line)));
  const scaled = taken.map((line) => ({ line, got: declared(line) }));
  return {
    taken,
    exact: scaled.filter((x) => x.got.distributive === true).map((x) => x.line),
    inexact: scaled.filter((x) => x.got.distributive === false).map((x) => x.line),
    open: scaled.filter((x) => x.got.distributive === null).map((x) => x.line),
  };
}
