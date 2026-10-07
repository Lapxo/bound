import { selectedCapsules } from '../host/selected-capsules.ts';
import { selectionLines, projectionLines } from '../fold/reach.ts';
export { selectionLines } from '../fold/reach.ts';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative } from 'node:path';
import { CAPSULE, LOCK, canonical, matches, PROTOCOL } from '@lapxo/topos/wire';
import { handed, readsOf } from '@lapxo/topos/capsule';
import type { Declaration } from '@lapxo/topos/capsule';
import type { Request } from '@lapxo/topos/contract';
import { STATES } from '@lapxo/obligations';
import { foldCeilings } from '../fold/ceilings.ts';
import { fieldOf, wireLinesOf as linesOf } from '../fold/claims.ts';
import { isCeiling } from '../fold/configures.ts';
import { keyFor } from '../fold/keys.ts';
import { casesHeld, placedReadings } from '../fold/observed.ts';
import { verdictsFor } from '../fold/paid.ts';
import { capsuleAt as isWorld, placesIn, spoken } from '../fold/places.ts';
import { rolesOf } from '../fold/roles.ts';
import { ownLockOf } from '../fold/signed.ts';
import { wordOn } from '../fold/wire.ts';
import { placesOf, viewsOf } from '../fold/views.ts';
import { zoomed } from '../fold/zoom.ts';
import type { Capsule } from '../host/capsule.ts';
import { sourced } from '../land/vouched.ts';
import { coordinatesUnder, observeText } from './files.ts';
import { ownLock } from './runner.ts';
import type { PlaceFold } from '../cli/place.ts';
import { nameOf } from '../render/page.ts';
import { placeLines, takenFor } from '../fold/place-inputs.ts';
import { isRegionDeclaration } from '../fold/region-declarations.ts';

type Asking = { readonly name: string; readonly at: number };
type Placed = Pick<PlaceFold, 'root' | 'store' | 'standing' | 'observed'> & { readonly under?: string; readonly second?: PlaceFold['second'] };
type Row = { readonly scope: string; readonly measure: string; readonly role: string; readonly bound: { readonly kind: string; readonly values?: readonly string[]; readonly lo?: number; readonly hi?: number } };

const fact = (scope: string, value: string, form = 'alphabet', measure = 'fact'): string => canonical({ scope, role: 'writes', form, measure, value, by: 'fold', at: 'place:fold' });
const described = (local: readonly string[] = []): readonly string[] => {
  const lock = ownLock();
  const eligible = (line: string): boolean => isRegionDeclaration(line, lock);
  const key = (line: string): string => `${fieldOf(line, 'scope')} ${fieldOf(line, 'measure')}`;
  const supplied = local.filter(eligible);
  const overridden = new Set(supplied.map(key));
  return [...lock.filter(eligible).filter((line) => !overridden.has(key(line))), ...supplied];
};

/** A declared selector keeps its contract token while the host binds only offered, concretely named regions. */
export function regionNames(reads: readonly string[], descriptions: readonly string[]): readonly string[] {
  const names = [...new Set(descriptions.map((line) => fieldOf(line, 'scope')).filter((scope) => scope.startsWith('region/') && !/[?*]/.test(scope)))];
  return names.filter((scope) => reads.some((read) => read.startsWith('region/') && matches(read, scope))).map((scope) => scope.slice('region/'.length));
}

export const describedReceipts = (): readonly string[] => described().filter((line) => fieldOf(line, 'measure') === 'receipts')
  .flatMap((line) => fieldOf(line, 'value').split('|').filter(Boolean));

function factsOf(fold: Placed): readonly string[] {
  const here = join(fold.root, fold.under ?? '');
  const written = [...viewsOf(fold.standing).values()].flatMap((view) => ('regions' in view && view.shape && observeText(join(here, view.shape)) !== undefined ? [view.shape] : []));
  return [fact('cases/held', String(casesHeld(fold.observed))), ...(fold.second ? [fact('second/verdict', fold.second.verdict)] : []),
    ...[...new Set(written)].map((shape) => fact(`${sourced(fold.standing)}/${shape}`, 'present')), ...('ceilings' in fold ? [...readingsOf(fold as PlaceFold), ...verdictOf(fold as PlaceFold), ...(released(fold as PlaceFold) ? [] : askedOf(fold as PlaceFold))] : []), ...coordinatesOf(fold)];
}

/** The place's own ceilings as the fold reads them, one line a ceiling at the scope the place speaks it: the bound stays its line's. */
function readingsOf(fold: PlaceFold): readonly string[] {
  const held = fold.standing.filter((line) => fieldOf(line, 'value') !== 'withdraw');
  const ceilings = held.filter((line) => isCeiling(line) && (!fold.under || takenFor(held, `${nameOf(fold)}/`)(line)));
  const read = foldCeilings({ standing: fold.standing, ceilings, observed: fold.observed, own: fold.own, epoch: fold.epoch }).readings;
  const spans = (got: readonly string[]): readonly number[][] => got.map((one) => (one.split(' ').at(-1) ?? '').split('..').map(Number)).filter((span) => span.every(Number.isFinite));
  return ceilings.flatMap((line) => ((got) => (got === undefined ? [] : [canonical({ scope: fieldOf(fold.under ? zoomed(line, nameOf(fold)) : line, 'scope'), role: 'reads', measure: fieldOf(line, 'measure'), by: 'fold', at: 'place:fold',
    ...(spans(got).length === got.length ? { form: 'interval', value: `${Math.min(...spans(got).map((span) => span[0]!))}..${Math.max(...spans(got).map((span) => span.at(-1)!))}` } : { form: 'alphabet', value: [...new Set(got)].join('|') }) })]))(read.get(fieldOf(line, 'scope'))));
}

const released = (fold: PlaceFold): boolean => fold.standing.some((line) => [`publish/${nameOf(fold)}/bootstrap`, 'publish/bootstrap'].includes(fieldOf(line, 'scope')) && fieldOf(line, 'value') !== 'withdraw');
const pinnersOf = (fold: PlaceFold): readonly string[] => [...new Set(fold.standing.filter((line) => fieldOf(line, 'value') !== 'withdraw')
  .flatMap((line) => ((steps) => (steps.length === 3 && steps[1] === 'uses' && steps[2] === nameOf(fold) ? [steps[0]!] : []))(fieldOf(line, 'scope').split('/'))))];
const capsuleOf = (fold: Placed): readonly string[] => [CAPSULE, LOCK].map((file) => linesOf(observeText(join(fold.root, fold.under ?? '', file))))
  .find((lines) => lines.some((line) => fieldOf(line, 'scope').startsWith('capsule/'))) ?? [];
const coordinatesOf = (fold: Placed): readonly string[] => ((here, role) => (!isWorld(fold.root, (fold.under ?? '').replace(/\/$/, '')) || (fold.under === undefined && !released(fold as PlaceFold)) ? []
  : coordinatesUnder(here, here, (dir) => dir === '' || (!basename(dir).startsWith('.') && role(relative(dirname(fold.store), join(here, dir))) !== 'foreign'))
    .map((file) => fact(`coordinate/${file}`, neededBy(fold.standing, fold.under ?? '', file) ? 'needed' : 'present'))))(join(fold.root, fold.under ?? ''), rolesOf(fold.store));
const neededBy = (standing: readonly string[], under: string, file: string): boolean => standing.some((line) => fieldOf(line, 'value') !== 'withdraw' && fieldOf(line, 'measure') !== 'reader'
  && fieldOf(line, 'needs').split('|').some((need) => !['', './', under].includes(need) && (need === `${under}${file}` || (need.endsWith('/') && `${under}${file}`.startsWith(need)) || matches(need, `${under}${file}`))));
function askedOf(fold: PlaceFold): readonly string[] {
  const at = (place: string): ReadonlySet<string> => ((lines) => ((views) => new Set(views.filter((view) => placesOf(lines, view).includes(`${place}/`) || (!placesOf(lines, view).length
    && observeText(join(fold.root, place, view.shape)) !== undefined && !views.some((other) => other.shape === view.shape && placesOf(lines, other).includes(`${place}/`)))).flatMap((view) => view.regions.map((one) => one.name))))([...viewsOf(lines).values()].flatMap((view) => ('regions' in view && view.shape ? [view] : []))))([...ownLockOf(fold.root, place, true), ...fold.standing]);
  return fold.under ? [...new Set(capsuleOf(fold).filter((line) => fieldOf(line, 'scope').startsWith('region/') && fieldOf(line, 'role') === 'render').map((line) => fieldOf(line, 'scope').slice('region/'.length)))]
    .map((name) => ((n) => fact(`asked/${name}`, `${n}..${n}`, 'interval', 'count'))(pinnersOf(fold).map(at).filter((names) => names.has(name)).length)) : [];
}

/** The place's verdict line as counts: what the fold lands, forks and refuses, each of the object's four states, and the ceilings it meets. */
function verdictOf(fold: PlaceFold): readonly string[] {
  const states = Object.values(verdictsFor(fold));
  const named = (line: string): readonly [string, string] => ((cut) => [line.slice(0, cut < 0 ? line.length : cut).trim(), line.slice(cut < 0 ? line.length : cut + 3).trim() || line] as const)(line.indexOf(' · '));
  const here = (fold.under ?? '').replace(/\/$/, '');
  const others = new Set(here ? placesIn(fold.root).filter((place) => place !== here) : []);
  const mine = (scope: string): boolean => {
    if (!here) return true;
    if (scope === here || scope.startsWith(`${here}/`)) return true;
    const head = scope.split('/')[0] ?? '';
    return !others.has(head);
  };
  return ([['claims', fold.claims], ['forks', fold.forks.length + (fold.second.verdict === 'forks' ? 1 : 0)], ['refused', fold.refused.length], ['vacuous', fold.vacuous], ['history', fold.history.length],
    ['met', fold.ceilings.read], ['short', fold.ceilings.short.length], ['over', fold.ceilings.over.length], ...STATES.map((one) => [one, states.filter((state) => state === one).length])] as const).map(([name, n]) => fact(`verdict/${name}`, `${n}..${n}`, 'interval', 'count'))
    .concat(fold.ceilings.short.filter((one) => mine(named(one)[0])).map((one) => (([scope, reading]) => fact(`unpaid/${scope}`, reading))(named(one))))
    .concat(fold.ceilings.over.filter((one) => mine(named(one)[0])).map((one) => (([scope, reading]) => fact(`outside/${scope}`, reading))(named(one))))
    .concat(fold.ceilings.unread.filter(mine).map((scope) => fact(`unpaid/${scope}`, 'unread')))
    .concat(fold.missing.filter((line) => mine(fieldOf(line, 'scope'))).map((line) => fact(`unpaid/${fieldOf(line, 'scope')}`, 'unpaid')))
    .concat([
      fact('walk/read', `${fold.own['walk-read'] ?? 0}..${fold.own['walk-read'] ?? 0}`, 'interval', 'count'),
      fact('walk/ms', `${fold.own['walk-ms'] ?? 0}..${fold.own['walk-ms'] ?? 0}`, 'interval', 'count'),
    ]);
}

function regionOf(fold: Placed, name: string, lines: readonly string[], facts: () => readonly string[]): { readonly lines: readonly string[]; readonly receipts: readonly string[] } {
  const here = fold.under ?? '';
  const said = (measure: string): readonly string[] => handed([`region/${name}`], lines).filter((fields) => fields['measure'] === measure)
    .flatMap((fields) => (fields['value'] ?? '').split('|').filter(Boolean));
  const globs = said('receipts');
  const placed = placedReadings(fold.observed).filter((one) => one.place.startsWith(here) && globs.some((glob) => matches(glob, one.question)))
    .map((one) => canonical({ scope: one.question, role: 'reads', form: 'alphabet', measure: one.measure, value: one.value, by: one.by, evidence: one.at, at: `place:${one.place.slice(here.length).replace(/^\.\/$/, '')}` }));
  const role = rolesOf(fold.store);
  const walked = coordinatesUnder(join(fold.root, here), fold.root, (dir) => dir === '' || (!basename(dir).startsWith('.') && role(relative(dirname(fold.store), join(fold.root, dir))) !== 'foreign'));
  const named = wordOn(fold.standing, 'region-coordinate', ownLock());
  const files = said(named).flatMap((glob) => walked.filter((file) => matches(glob, file.slice(here.length)) || matches(glob, file)));
  const saidLines = files.flatMap((file) => {
    if (basename(file) === 'TARGET.bound' || basename(file) === 'receipts.bound') return [];
    const lock = linesOf(observeText(join(fold.root, file)));
    return lock.length ? [canonical({ scope: 'said/lines', role: 'reads', form: 'alphabet', measure: 'lines', value: lock.join('\n'), by: 'reader', at: `place:${file}` })] : [];
  });
  return {
    lines: said('lines').flatMap((coordinate) => linesOf(observeText(join(fold.root, here, coordinate)))),
    receipts: [...placed, ...saidLines, ...(globs.length ? facts() : []).filter((line) => globs.some((glob) => matches(glob, fieldOf(line, 'scope'))))],
  };
}

/** A local selection belongs to its own lock; tree-qualified selections retain their explicit owner. */
const heldCapsules = new WeakMap<Placed, readonly Capsule[]>();
/** Execution is supplied only by explicit capsule offers of the selected standing. */
export function capsulesOf(fold: Placed): readonly Capsule[] {
  const cached = heldCapsules.get(fold);
  if (cached !== undefined) return cached;
  const got = selectedCapsules(selectionLines(fold),undefined,undefined,projectionLines(fold)).map(one => one.capsule);
  heldCapsules.set(fold, got);
  return got;
}
export const declaredBy = (fold: Placed): readonly string[] => [...new Set(capsulesOf(fold).flatMap((capsule) => capsule.declaration.renders))];

type Ask = (declaration: Declaration, one: Asking, verb: 'render' | 'read', shape: string) => Request | undefined;
const asks = new WeakMap<Placed, Ask>();

/**
 * What a region of a capsule is handed: of the reads its line declares, every read of the place's lines, and each region
 * a line of the instrument's lock describes, with its lines and its receipts; a region no line describes is not handed,
 * and a region handed less than it declares is refused by its capsule, which is every capsule's no. Nothing is handed
 * as a file: the lines are the place as its published lock holds them, and each region is read once for the fold,
 * however many views ask it.
 */
export const askingOf = (fold: Placed): Ask => asks.get(fold) ?? asks.set(fold, handing(fold)).get(fold)!;

function handing(fold: Placed): Ask {
  const capsule = linesOf(observeText(join(fold.root, fold.under ?? '', CAPSULE))).filter((line) => fieldOf(line, 'scope').startsWith('region/'));
  const seen = handed(['**'], fold.under ? placeLines(fold) : fold.standing);
  const lines = described(seen.map((fields) => canonical(fields)));
  let held: readonly string[] | undefined;
  const facts = (): readonly string[] => (held ??= factsOf(fold));
  const regions = new Map<string, ReturnType<typeof regionOf>>();
  const region = (name: string): ReturnType<typeof regionOf> => regions.get(name) ?? regions.set(name, regionOf(fold, name, lines, facts)).get(name)!;
  return (declaration, one, verb, shape) => {
    const declared = readsOf(declaration, one.name);
    if (declared === undefined) return undefined;
    const reads = declared.filter((read) => !read.startsWith('region/') || handed([read], lines).length > 0 || (matches(read, 'region/capsule') && capsule.length > 0));
    const names = [...new Set([...regionNames(reads, lines), ...(capsule.length && reads.some((read) => matches(read, 'region/capsule')) ? ['capsule'] : [])])];
    return { protocol: PROTOCOL, verb, rootScope: fold.under ?? '', files: [], region: one.name, at: one.at, shape, name: nameOf(fold) || basename(fold.root),
      lines: seen
        .filter((fields) => reads.some((read) => matches(read, fields['scope'] ?? ''))).map((fields) => canonical(fields)), reads,
      regions: Object.fromEntries(names.map((name) => [name, name === 'capsule' && capsule.length ? { lines: capsule, receipts: [] } : region(name)])) };
  };
}

const read = new WeakMap<readonly string[], Map<string, readonly string[]>>();

function capsuleReadings(fold: Placed): readonly string[] {
  const place = fold.under || './';
  const known = read.get(fold.observed) ?? read.set(fold.observed, new Map()).get(fold.observed)!;
  return known.get(place) ?? known.set(place, readingsAt(fold, place)).get(place)!;
}

function readingsAt(fold: Placed, place: string): readonly string[] {
  const asking = askingOf(fold);
  const speaker = keyFor(fold.store, 'read');
  return capsulesOf(fold).flatMap((capsule) => {
    const writing = new Set(capsule.lines.filter((line) => fieldOf(line, 'scope').startsWith('region/') && fieldOf(line, 'measure') === 'writes').map((line) => fieldOf(line, 'scope').slice('region/'.length)));
    const receipts = Object.keys(capsule.declaration.writes).filter((name) => capsule.declaration.writes[name] === 'receipt' && !writing.has(name)).sort();
    const requests = receipts.flatMap((name) => ((request) => (request === undefined ? [] : [request]))(asking(capsule.declaration, { name, at: 3 }, 'read', '')));
    const answers = capsule.ask(requests);
    const refused = requests.filter((_, i) => answers[i]?.kind !== 'fact');
    if (refused.length) throw new Error(`REFUSE·capsule ${capsule.digest} · ${place} · ${refused.length} of ${requests.length} regions: ${refused.map((one) => one.region).join(' ')} · ${answers[requests.indexOf(refused[0]!)]?.why ?? 'no answer'}`);
    return requests.flatMap((request, i) => {
      const said = answers[i];
      if (said?.kind !== 'fact') return [];
      const digest = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const at = `place:sha256:${digest}`;
      const by = `${speaker}:${capsule.digest.slice(7, 19)}`;
      const line = (row: Row): string => canonical({ scope: row.scope, role: row.role, form: row.bound.kind === 'interval' ? 'interval' : 'alphabet', measure: row.measure,
        value: row.bound.kind === 'interval' ? `${row.bound.lo ?? 0}..${row.bound.hi ?? 0}` : (row.bound.values ?? []).join('|'), by, at });
      return [canonical({ scope: place, role: 'writes', form: 'alphabet', measure: 'observed', value: digest.slice(0, 16), by, at }),
        ...((said.claims ?? []) as readonly Row[]).map(line)];
    });
  });
}

export function capsuleReadingsOver(fold: Placed): readonly string[] {
  if (fold.under) return capsuleReadings(fold);
  const said = spoken(fold.root);
  const places = [...new Set(fold.standing.flatMap((line) => /^([^/]+)\/uses\//.exec(fieldOf(line, 'scope'))?.[1] ?? []))];
  return [...capsuleReadings(fold), ...places.flatMap((place) => capsuleReadings({ ...fold, under: `${place}/`,
    standing: [...new Set([...said.filter((one) => one.place === place).map((one) => one.line), ...fold.standing])] }))];
}
