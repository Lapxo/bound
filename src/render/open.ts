import { fieldOf } from '../fold/claims.ts';
import { alphabet } from '@lapxo/topos/wire';
import { declaredConfig as declared } from '@lapxo/topos/forms';
import { bytesDigest } from '../fold/digests.ts';

export interface OpenCell {
  readonly scope: string;
  readonly ceiling: string;
  readonly bits: number | null;
  readonly freedom: string;
  readonly states: readonly string[];
  readonly origins: readonly string[];
  readonly rank: number;
  readonly cone: string;
}

/**
 * What is open, as cells, taken once when the tree is folded and read by the view rather than taken again at every
 * render. A line of the lock with more than one bit still free is a question this tree has not answered; a cell with
 * one legal state is applied and not open; a cell a reading has already answered is applied whatever its width; a
 * cell standing on one origin with a closer already named is asked and not open. A cell says of itself that it is a
 * decision: a ceiling in force is not a question because it is wide, and a lock with no decision in it is a lock with
 * nothing open, which the render says by saying nothing. What each state would be worth is rendered beside it, and a quantity this instrument cannot yet take is
 * rendered grey with the name of what would take it, never as a number it invented.
 */
export function openCells(input: {
  readonly store: string;
  readonly standing: readonly string[];
  readonly observed: readonly string[];
  readonly grey: readonly string[];
  readonly epoch: number;
}): readonly OpenCell[] {
  const { store, standing, observed } = input;
  const rests = new Map<string, number>();
  const asked = new Set<string>();
  for (const line of standing) {
    for (const name of fieldOf(line, 'restsOn').split('|').filter(Boolean)) rests.set(name, (rests.get(name) ?? 0) + 1);
    for (const need of fieldOf(line, 'needs').split('|').filter(Boolean)) asked.add(need);
  }
  const by = new Map<string, Set<string>>();
  for (const line of [...standing, ...observed]) {
    const at = fieldOf(line, 'scope');
    by.set(at, (by.get(at) ?? new Set()).add(fieldOf(line, 'by')));
  }
  const grey = new Set(input.grey.map((line) => fieldOf(line, 'scope')));
  const answered = new Set(observed.map((line) => fieldOf(line, 'scope')));
  const asDecision = standing.filter((line) => fieldOf(line, 'shape') === 'decision' && fieldOf(line, 'value') !== 'withdraw');
  const held = asDecision.length ? asDecision : [];
  const out: OpenCell[] = [];
  for (const line of held) {
    const scope = fieldOf(line, 'scope');
    const value = fieldOf(line, 'value');
    const freedom = declared(line);
    const bits = freedom.bits;
    if (freedom.kind === 'inactive' || (bits !== null && bits < 1)) continue;
    if (answered.has(scope) || (grey.has(scope) && asked.has(scope))) continue;
    const needs = fieldOf(line, 'needs');
    out.push({
      scope,
      ceiling: value,
      bits,
      freedom: freedom.kind,
      states: freedom.kind === 'finite' && freedom.form === 'alphabet' ? [...new Set(alphabet(value).members)] : [],
      origins: [...(by.get(scope) ?? new Set<string>())].sort(),
      rank: rests.get(scope) ?? 0,
      cone: needs ? bytesDigest(store, new TextEncoder().encode(needs)).replace(/^[^:]*:/, '').slice(0, 8) : '',
    });
  }
  return out.sort((a, b) => b.rank - a.rank || (b.bits ?? 0) - (a.bits ?? 0) || a.scope.localeCompare(b.scope));
}

export const openCards = (open: readonly OpenCell[]): readonly string[] => open.flatMap((cell) => [
  `OPEN     ${cell.scope} · cone ${cell.cone || 'grey · a demand would name it'} · ceiling ${cell.ceiling}`
  + ` · origins ${cell.origins.length} ${cell.origins.join(' ')} · ${cell.bits === null ? `unknown freedom (${cell.freedom})` : `${cell.bits.toFixed(1)} bits`}`,
  ...cell.states.map((state) => `CANDIDATE ${state} · rank ${cell.rank}`),
]);
