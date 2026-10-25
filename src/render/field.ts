import type { PlaceFold } from '../cli/place.ts';
import { fieldOf } from '../fold/claims.ts';
import { placesIn } from '../fold/places.ts';
import { placedAt } from '../fold/reach.ts';
import { polesOf, rankOf, unpackRegions } from '../fold/region.ts';
import { INTERVALS } from '@lapxo/topos/forms';

type Status = 'disagreement' | 'outside' | 'unanswered' | 'met';
const WORST: readonly Status[] = ['disagreement', 'outside', 'unanswered', 'met'];
const empty = (ceiling: { readonly lo: number; readonly hi: number } | readonly string[] | undefined): boolean =>
  ceiling !== undefined && 'lo' in ceiling && !INTERVALS.inhabited(ceiling);

/** Host file-region readings, grouped by coordinate prefix. These statuses do not compute object encounters. */
export function field(fold: PlaceFold, at: number): readonly string[] {
  if (fold.regions === undefined) return ['GREY     field · this fold carries no region summaries; it is read again at the next fold'];
  const regions = unpackRegions(fold.regions);
  const places = placesIn(fold.root);
  const place = fold.under?.replace(/\/$/, '');
  const here = (line: string): boolean => place === undefined || [place, undefined].includes(placedAt(places, line));
  const own = { ...fold.own, unread: fold.ceilings.unread.length + fold.ceilings.vacuous.length };
  const poles = new Map<string, ReturnType<typeof polesOf>>();
  const states: (readonly [string, Status])[] = [
    ...regions.bounds.filter((bound) => here(bound.line)).map((bound) => {
      const ceiling = (poles.get(bound.region) ?? poles.set(bound.region, polesOf(regions, bound.region)).get(bound.region)!).get(`${bound.question} ${bound.measure}`)?.ceiling;
      const got = rankOf(regions, bound, own);
      return [fieldOf(bound.line, 'scope'), empty(ceiling) ? 'disagreement' : got.bars || got.sums ? 'outside' : got.met ? 'met' : 'unanswered'] as const;
    }),
    ...fold.missing.filter(here).map((line) => [fieldOf(line, 'scope'), 'unanswered'] as const),
    ...fold.forks.flatMap((fork) => fork.lines.slice(0, 1)).filter(here).map((line) => [fieldOf(line, 'scope'), 'disagreement'] as const),
  ];
  const cells = new Map<string, { state: Status; bounds: number }>();
  for (const [scope, state] of states) {
    const cell = scope.split('/').slice(0, Math.max(1, at)).join('/');
    const held = cells.get(cell);
    cells.set(cell, { state: held !== undefined && WORST.indexOf(held.state) < WORST.indexOf(state) ? held.state : state, bounds: (held?.bounds ?? 0) + 1 });
  }
  const ordered = [...cells].sort((a, b) => WORST.indexOf(a[1].state) - WORST.indexOf(b[1].state) || a[0].localeCompare(b[0]));
  return [
    '## field', '', '```',
    `FIELD    @${at} · ${cells.size} groups · ${states.length} bounds · readings · no encounters computed · ${WORST.map((state) => `${state} ${ordered.filter(([, one]) => one.state === state).length}`).join(' · ')}`,
    ...ordered.map(([cell, one]) => `FIELD    ${cell} · ${one.state} · ${one.bounds} bounds`),
    '```',
  ];
}
