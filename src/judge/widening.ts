import { fieldOf } from '../fold/claims.ts';
import { ALPHABETS, idsOf, INTERVALS, spanOf } from '@lapxo/topos/forms';

/**
 * A ceiling that admits more than it did is not a revision of the same kind as one that admits less: narrowing costs
 * the signer nothing anyone else can dispute, while widening gives back freedom the tree had already spent. So a line
 * that widens what it replaces is refused unless it says what forced it — an `at` of the witness class, which names
 * the reading or the case that made the old bound wrong. Policy may narrow; only a witness may widen. A list of what is
 * forbidden narrows as it grows.
 */
function widens(now: string, before: string): boolean {
  const [was, held] = [spanOf(fieldOf(before, 'value')), spanOf(fieldOf(now, 'value'))];
  if (was && held) return INTERVALS.leq(was, held) && !INTERVALS.leq(held, was);
  const [old, fresh] = [idsOf(fieldOf(before, 'value')), idsOf(fieldOf(now, 'value'))];
  return old.polarity === fresh.polarity && ALPHABETS.leq(old, fresh) && !ALPHABETS.leq(fresh, old);
}

export function widenedWithoutWitness(
  proposed: readonly string[],
  standing: readonly string[],
  isCeiling: (line: string) => boolean,
  witness: string,
): readonly string[] {
  const held = new Map(standing.filter(isCeiling).map((line) => [fieldOf(line, 'scope'), line]));
  return proposed.filter((line) => {
    const before = held.get(fieldOf(line, 'scope'));
    if (!before || !isCeiling(line) || !widens(line, before)) return false;
    return !fieldOf(line, 'at').startsWith(`${witness}:`);
  });
}
