import { matches } from '@lapxo/topos/wire';
import { fieldOf } from './claims.ts';
import { viewsOf } from './views.ts';

const wild = (glob: string): boolean => glob.split('/').every((step) => step === '' || step === '*' || step === '**');

const covers = (glob: string, scope: string, rel: string): boolean => !wild(glob) && (matches(glob, rel) || matches(glob, scope));

/**
 * What one landed line opens inside its place: a region whose reads cover the line's scope, a view whose shape covers
 * it, and the scope's own tail. Every other region stays on its receipt at one step.
 */
export function openedBy(places: readonly string[], standing: readonly string[], lines: readonly string[]): readonly string[] {
  const known = new Set(places);
  const reads = standing.filter((line) => fieldOf(line, 'scope').startsWith('region/') && fieldOf(line, 'measure') === 'reads' && fieldOf(line, 'value') !== 'withdraw');
  const views = [...viewsOf(standing).values()];
  const opened = new Set<string>();
  for (const line of lines) {
    const scope = fieldOf(line, 'scope');
    const [place = '', ...rest] = scope.split('/');
    if (!known.has(place)) continue;
    const rel = rest.join('/');
    if (rel) opened.add(`${place}/${rel}`);
    for (const region of reads) {
      const name = fieldOf(region, 'scope').slice('region/'.length);
      if (covers(fieldOf(region, 'value'), scope, rel)) opened.add(`${place}/${name}`);
    }
    for (const view of views) if (view.shape && covers(view.shape, scope, rel)) opened.add(`${place}/${view.name}`);
  }
  return [...opened].sort();
}
