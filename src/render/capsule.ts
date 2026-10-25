import { matches } from '@lapxo/topos/wire';
import type { PlaceFold } from '../cli/place.ts';
import { askingOf, capsulesOf } from '../observe/regions.ts';

type Asking = { readonly name: string; readonly at: number };
type Viewed = { readonly asking: readonly Asking[]; readonly shape: string };

export const capsuleRegions = (fold: PlaceFold, asking: readonly Asking[], shape = ''): ReadonlyMap<string, readonly string[]> =>
  capsuleViews(fold, [{ asking, shape }])[0] ?? new Map<string, readonly string[]>();

/**
 * A region this instrument does not render is rendered by a capsule: one the place uses by the digest of its lock and
 * its bytes, or else one the instrument carries. What the views of one fold ask of each capsule is asked at once; a
 * region one capsule answered is not asked of another, and one it refused or never answered is named and asked of the
 * next only when no region was offered. A refusal from an offered region stops the request; it never selects another implementation.
 */
export const capsuleViews = (fold: PlaceFold, views: readonly Viewed[]): readonly ReadonlyMap<string, readonly string[]>[] => capsuleAnswers(fold, views).map((answers) => new Map([...answers].map(([name, answer]) => [name, answer.lines] as const)));

type Answer = { readonly lines: readonly string[]; readonly by: string };

/** What each capsule answered a view's regions with, the capsule by its digest, and whether the place's pin chose it. */
export function capsuleAnswers(fold: PlaceFold, views: readonly Viewed[]): readonly ReadonlyMap<string, Answer>[] {
  const outs = views.map(() => new Map<string, Answer>());
  if (!views.some((view) => view.asking.length)) return outs;
  const asking = askingOf(fold);
  for (const capsule of capsulesOf(fold)) {
    const asked = views.flatMap((view, i) => view.asking.filter((one) => capsule.declaration.renders.some((glob) => matches(glob, one.name)) && !outs[i]!.has(one.name))
      .flatMap((one) => ((request) => (request === undefined ? [] : [{ i, one, request }]))(asking(capsule.declaration, one, 'render', view.shape))));
    const answers = capsule.ask(asked.map((one) => one.request));
    asked.forEach(({ i, one, request }, at) => {
      const said = answers[at];
      if (said?.kind === 'fact') outs[i]!.set(one.name, { lines: ((got) => got.lines ?? got.leaf ?? [])(said as unknown as { readonly lines?: readonly string[]; readonly leaf?: readonly string[] }), by: capsule.digest });
      else throw new Error(`REFUSE·capsule ${capsule.digest} · ${request.rootScope}${one.name} · ${said?.why ?? 'no answer'}`);
    });
  }
  return outs;
}
