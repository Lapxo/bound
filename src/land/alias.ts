import { ENVELOPE } from '@lapxo/topos/wire';
import { fieldOf, fieldsOf } from '../fold/claims.ts';
import { lockStanding } from '../fold/keys.ts';
import { worldsIn } from '../fold/places.ts';
import { ownLockOf } from '../fold/signed.ts';
import { storeOf } from './ledger.ts';

const retracts = (withdraw: Readonly<Record<string, string>>, line: Readonly<Record<string, string>>): boolean =>
  Object.keys(withdraw).filter((key) => !ENVELOPE.has(key) && key !== 'value').every((key) => line[key] === withdraw[key]);

const pinScope = (scope: string): boolean => scope === 'uses' || scope.startsWith('uses/') || scope.includes('/uses/');

const aliasWithdraw = (line: string): boolean =>
  fieldOf(line, 'value') === 'withdraw' && fieldOf(line, 'scope').startsWith('dep/') && fieldOf(line, 'role') !== 'reads';

/**
 * An alias is gone only when no pin will still name its digest. The pins are the root's uses lines and each world's own,
 * minus the pins this batch itself withdraws, plus the pins it adds. Checked before the trial, so a batch that would
 * orphan a pin lands nothing.
 */
export function aliasPinned(root: string, signed: readonly string[]): readonly { readonly scope: string; readonly digest: string; readonly by: readonly string[] }[] {
  const aliases = lockStanding(storeOf(root)).filter((line) => fieldOf(line, 'scope').startsWith('dep/') && fieldOf(line, 'role') !== 'reads' && fieldOf(line, 'value') !== 'withdraw');
  const digests = new Map<string, { readonly scope: string; readonly digest: string }>();
  for (const withdraw of signed.filter(aliasWithdraw)) {
    const fields = fieldsOf(withdraw);
    for (const line of aliases) {
      if (!retracts(fields, fieldsOf(line))) continue;
      const digest = fieldOf(line, 'value');
      const kept = signed.some((one) => fieldOf(one, 'scope') === fieldOf(line, 'scope') && fieldOf(one, 'value') === digest);
      if (!kept) digests.set(`${fieldOf(line, 'scope')}\0${digest}`, { scope: fieldOf(line, 'scope'), digest });
    }
  }
  if (!digests.size) return [];
  const named = [
    ...lockStanding(storeOf(root)).filter((line) => pinScope(fieldOf(line, 'scope')) && fieldOf(line, 'value') !== 'withdraw').map((line) => ({ scope: fieldOf(line, 'scope'), value: fieldOf(line, 'value'), fields: fieldsOf(line) })),
    ...worldsIn(root).flatMap((place) => ownLockOf(root, place).filter((line) => pinScope(fieldOf(line, 'scope')) && fieldOf(line, 'value') !== 'withdraw').map((line) => ({ scope: `${place}/${fieldOf(line, 'scope')}`, value: fieldOf(line, 'value'), fields: fieldsOf(line) }))),
  ];
  const still = named.filter((pin) => !signed.some((line) => fieldOf(line, 'value') === 'withdraw' && retracts(fieldsOf(line), pin.fields)));
  const added = signed.filter((line) => pinScope(fieldOf(line, 'scope')) && fieldOf(line, 'value') !== 'withdraw').map((line) => ({ scope: fieldOf(line, 'scope'), value: fieldOf(line, 'value') }));
  return [...digests.values()].flatMap((alias) => {
    const by = [...still.filter((pin) => pin.value === alias.digest).map((pin) => pin.scope), ...added.filter((pin) => pin.value === alias.digest).map((pin) => pin.scope)];
    return by.length ? [{ scope: alias.scope, digest: alias.digest, by }] : [];
  });
}
