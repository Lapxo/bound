import { canonical } from '@lapxo/topos/wire';
import { fieldOf } from '../fold/claims.ts';
import { fullDigest } from '../fold/digests.ts';
import { inside, locationsOf, vouchedCoordinates } from '../land/vouched.ts';
import { wordOf } from '../fold/wire.ts';
import { holdsCases } from '../fold/paid.ts';

/**
 * A demand that landed after its coordinates. A take judges what moved, because it assumes the demand came first and the
 * tree after it; a demand that arrives second has nothing left to move — its cone is already in the ledger, every coordinate
 * of it vouched at a digest. Judging that is reading, not observing, so it is answered where it lands and no file is
 * touched to force it. A demand whose cone holds no vouched coordinate is not late, it is unlanded, and it waits for a take.
 */
export function lateFacts(store: string, signed: readonly string[], answered: ReadonlySet<string>): readonly string[] {
  const vouched = [...vouchedCoordinates(store)];
  const views = `${wordOf(signed, 'families', 'view')}/`;
  const out: string[] = [];
  for (const line of signed) {
    const scope = fieldOf(line, 'scope');
    const value = fieldOf(line, 'value') || 'present';
    if (fieldOf(line, 'role') !== 'demands' || value === 'withdraw' || answered.has(scope)) continue;
    const asked = locationsOf(fieldOf(line, 'needs')).locations;
    if (!asked.length || (!scope.startsWith(views) && !asked.some(holdsCases))) continue;
    const cone = asked.map((where) => vouched.filter(([coordinate]) => inside(coordinate, where)));
    if (cone.some((held) => !held.length)) continue;
    const held = cone.flat();
    const at = `cone:${fullDigest(store, held.map(([coordinate, digest]) => `${coordinate} ${digest}`).sort()).replace(/^sha256:/, '')}`;
    out.push(
      canonical({ scope, role: 'writes', form: 'alphabet', measure: fieldOf(line, 'measure') || 'status', value, by: 'judge', at }),
      canonical({ scope, role: 'writes', form: 'alphabet', measure: 'cone', value: held.map(([coordinate]) => coordinate).join('|'), by: 'judge', at }),
    );
  }
  return out;
}
