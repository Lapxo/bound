import { foldCeilings } from '../fold/ceilings.ts';
import { fieldOf } from '../fold/claims.ts';
import { isCeiling } from '../fold/configures.ts';
import { placedReadings } from '../fold/observed.ts';
import { boundOf, rankOf, regionsOf } from '../fold/region.ts';
import type { Bound, Regions } from '../fold/region.ts';

/**
 * The ceilings of a batch that would stand unread: no reading meets them and no reading of the instrument's own
 * carries their measure. A batch that also signs a reader goes through whole, since what a reader reads is known only
 * once it runs, and so does a ceiling a gate of the same act reads, whose reading lands with it or refuses it.
 */
export function inertIn(batch: readonly string[], input: {
  readonly standing: readonly string[];
  readonly ceiling: (line: string) => boolean;
  readonly signsReader: boolean;
  readonly observed: readonly string[];
  readonly own: Readonly<Record<string, number>>;
  readonly epoch: number;
}): readonly string[] {
  if (input.signsReader) return [];
  const folded = foldCeilings({ standing: input.standing, ceilings: batch.filter(input.ceiling), observed: input.observed, own: input.own, epoch: input.epoch });
  return [...folded.unread, ...folded.vacuous];
}

/** What each ceiling of a batch would bite, read off the summaries of the cone before anything lands. */
export function rankedIn(batch: readonly string[], fold: { readonly standing: readonly string[]; readonly observed: readonly string[]; readonly own: Readonly<Record<string, number>> }): readonly string[] {
  const regions: Regions = regionsOf(fold.standing, [...fold.standing.filter(isCeiling), ...batch], placedReadings(fold.observed));
  return batch.map((line) => {
    const bound: Bound = boundOf(regions.named, line);
    const got = rankOf(regions, bound, fold.own);
    const bite = got.cells ? `bites ${got.cells} cells in ${got.bars} bars, ${got.fresh} no ceiling above bites` : got.sums ? `bites ${got.sums} sums` : `bites nothing of ${got.met} met`;
    return `RANK     ${fieldOf(line, 'scope')} · ${bite} · region ${bound.region || '.'}`;
  });
}

/** Every ceiling asked, at resolution one: what the fold reads for it, beside its bound, or unmeasured where no reading answers it. */
export function readingsIn(ceilings: readonly string[], fold: { readonly standing: readonly string[]; readonly observed: readonly string[]; readonly own: Readonly<Record<string, number>>; readonly epoch: number }): readonly string[] {
  const got = foldCeilings({ standing: fold.standing, ceilings, observed: fold.observed, own: fold.own, epoch: fold.epoch });
  const outside = new Map(got.over.map((one) => [one.ceiling, `${one.side} ${one.got}`] as const));
  return ceilings.map((line) => ((scope, read) => `RANK@1   ${scope} · ${fieldOf(line, 'measure')} ${fieldOf(line, 'value')} · ${read === undefined ? 'unmeasured'
    : `read ${read.length > 3 ? `${read.slice(0, 3).join(' · ')} +${read.length - 3}` : read.join(' · ')}`}${outside.has(scope) ? ` · ${outside.get(scope)}` : read === undefined ? '' : ' · met'}`)(fieldOf(line, 'scope'), got.readings.get(fieldOf(line, 'scope'))));
}
