import { selectedCapsules } from '../host/selected-capsules.ts';
import { basename } from '../host/io.ts';
import { canonical, matches, parse } from '@lapxo/topos/wire';
import { fieldOf } from './claims.ts';
import { spoken, worldsIn } from './places.ts';
import { wordOf, wordsOf } from './wire.ts';
import type { Capsule } from '../host/capsule.ts';
import { ownLock, ownRoot } from '../observe/runner.ts';
import { ownLockOf } from './signed.ts';

const ROOT = '.';
const WORLD = '\0';

/**
 * Who reads a line: the place its scope's first step names, or the one place its needs lie in but bound; every place for
 * a line an own lock speaks, the published place bound is measured over, a line publish/takes carries into every place,
 * a view, and a line whose needs are bound's own modules; the one place a later step of its scope names; and the root
 * alone, where the places join, for every other line: no place's pages read it.
 */
function ownerIn(root: string, places: readonly string[], standing: readonly string[]): (line: string) => string | undefined {
  const own = basename(ownRoot());
  const words = new Set(spoken(root).map((one) => one.line));
  const views = `${wordOf(standing, 'families', 'view')}/`;
  const takes = ownLock().filter((line) => fieldOf(line, 'scope') === 'publish/takes').flatMap((line) => fieldOf(line, 'value').split('|').filter(Boolean));
  return (line) => {
    const scope = fieldOf(line, 'scope');
    if (words.has(line)) return undefined;
    const steps = scope.split('/');
    if (places.includes(steps[0] ?? '')) return steps[0];
    const heads = new Set(fieldOf(line, 'needs').split('|').filter(Boolean).map((need) => need.split('/')[0] ?? ''));
    const head = [...heads][0] ?? '';
    if (heads.size === 1 && head !== own && places.includes(head)) return head;
    if (scope.startsWith(views)) return wordsOf(standing, 'views/world').includes(scope.slice(views.length)) ? WORLD : undefined;
    if (takes.some((glob) => matches(glob, scope))) return undefined;
    const named = places.filter((one) => steps.slice(1).includes(one));
    if (named.length) return named.length === 1 ? named[0] : undefined;
    return heads.size && [...heads].every((one) => one === own) ? undefined : ROOT;
  };
}

export const placedAt = (places: readonly string[], line: string): string | undefined => {
  const [first = '', next = ''] = fieldOf(line, 'scope').split('/');
  return places.includes(first) ? first : places.includes(next) ? next : undefined;
};

export function touchedBy(root: string, places: readonly string[], lines: readonly string[], standing: readonly string[]): readonly string[] {
  const owners = lines.map(ownerIn(root, places, standing));
  if (owners.some((one) => one === undefined)) return places;
  const worlds = owners.some((one) => one === WORLD) ? worldsIn(root) : [];
  return [...new Set([...owners.filter((one): one is string => one !== undefined && one !== ROOT && one !== WORLD), ...worlds])].sort();
}

/** A selected world can execute only its explicit capsule offers. Dependency aliases are host projections, not selections. */
export const selectionLines = (fold: { readonly root: string; readonly standing: readonly string[]; readonly under?: string }): readonly string[] => {
  const local = fold.under ? ownLockOf(fold.root, fold.under.replace(/\/$/, '')).filter((line) => fieldOf(line, 'scope').startsWith('uses/')) : [];
  const qualified = fold.standing.filter((line) => fieldOf(line, 'scope').startsWith(`${fold.under ?? ''}uses/`));
  return [...new Set([...local, ...qualified])].filter((line) => fieldOf(line, 'value') !== 'withdraw');
};

/** Host bindings belong to the selected place, never to another sibling's lock. */
const relativeProjections = (standing:readonly string[],prefix:string):readonly string[] => standing.filter(line=>fieldOf(line,'scope').startsWith(`${prefix}dep/`)).map(line=>{
  const got=parse(line,{preserveKeys:true});
  if(got.kind!=='fact')throw Error(`REFUSE·wire ${got.why}`);
  // An unsigned host projection of admitted fields, never a newly signed claim.
  const {sig,by,epoch,expires,repo,...fields}=got.value.fields;
  return canonical({...fields,scope:fields.scope!.slice(prefix.length)},got.value.version);
});
export const projectionLines = (fold: { readonly root: string; readonly standing: readonly string[]; readonly under?: string }): readonly string[] => {
  const place=fold.under?.replace(/\/$/,'')??'';
  const prefix=place?`${place}/`:'';
  const local=ownLockOf(fold.root,place).filter(line=>fieldOf(line,'scope').startsWith('dep/'));
  const qualified=relativeProjections(fold.standing,prefix);
  return [...new Set([...ownLock(),...local,...qualified])];
};

export function capsulesFor(standing: readonly string[], place: string, root?: string): readonly { readonly capsule: Capsule; readonly offer: string }[] {
  const prefix = place ? `${place}/` : '';
  const pins = root === undefined ? standing.filter(line => fieldOf(line, 'scope').startsWith(`${prefix}uses/`) && fieldOf(line, 'value') !== 'withdraw')
    : selectionLines({ root, standing, ...(prefix ? { under: prefix } : {}) });
  const host=root===undefined?[...ownLock(),...relativeProjections(standing,prefix)]
    :projectionLines({root,standing,...(prefix?{under:prefix}:{})});
  return selectedCapsules(pins,undefined,undefined,host);
}
