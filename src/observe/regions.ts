import {childFlags} from '../host/capsule.ts';
import {readingProfile,readingExecution,withReadingBoundary} from '../host/reading-context.ts';
import {readingIdentityBytes} from '@lapxo/topos/contract';
import {portableReadingReceipt,verifiedReadingReceipts} from '../host/reading-closures.ts';
import {bytesDigest,instrumentCoordinates} from '../fold/digests.ts';
import {ownRoot,processOf} from './runner.ts';
import {contentPolicy} from '../host/content-store.ts';
import {carriedFrom} from '../fold/resolved.ts';
import { selectedCapsules } from '../host/selected-capsules.ts';
import { selectionLines, projectionLines } from '../fold/reach.ts';
export { selectionLines } from '../fold/reach.ts';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative } from 'node:path';
import { CAPSULE, LOCK, canonical, matches, PROTOCOL } from '@lapxo/topos/wire';
import { handed, readsOf } from '@lapxo/topos/capsule';
import type { Declaration } from '@lapxo/topos/capsule';
import type { Request } from '@lapxo/topos/contract';
import { foldCeilings } from '../fold/ceilings.ts';
import { fieldOf, wireLinesOf as linesOf } from '../fold/claims.ts';
import { isCeiling } from '../fold/configures.ts';
import { keyFor } from '../fold/keys.ts';
import { casesHeld, placedReadings } from '../fold/observed.ts';
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

const receiptHasher = (store: Placed['store']) => (text: string): string => bytesDigest(store, new TextEncoder().encode(text));

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

/** File-fold readings and their ceilings; this path computes no object encounters. */
function verdictOf(fold: PlaceFold): readonly string[] {
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
    ['met', fold.ceilings.read], ['short', fold.ceilings.short.length], ['over', fold.ceilings.over.length]] as const).map(([name, n]) => fact(`verdict/${name}`, `${n}..${n}`, 'interval', 'count'))
    .concat([fact('verdict/computation', 'readings'), fact('verdict/encounters', 'uncomputed')])
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
  const speaker = keyFor(fold.store, 'read');
  return capsulesOf(fold).flatMap((capsule) => {
    const writing = new Set(capsule.lines.filter((line) => fieldOf(line, 'scope').startsWith('region/') && fieldOf(line, 'measure') === 'writes').map((line) => fieldOf(line, 'scope').slice('region/'.length)));
    const receipts = Object.keys(capsule.declaration.writes).filter((name) => capsule.declaration.writes[name] === 'receipt' && !writing.has(name)).sort();
    const target=modernReceiptInputs(fold,capsule.selection??capsule.digest);
    const asking=askingOf({...fold,observed:target.current});
    const requests = receipts.flatMap((name) => ((request) => (request === undefined ? [] : [request]))(asking(capsule.declaration, { name, at: 3 }, 'read', '')));
    const modern=readingProfile(fold.standing,fieldOf);
    if(modern&&requests.length){
      const hash=receiptHasher(fold.store);
      const batch=hash(JSON.stringify([capsule.selection??capsule.digest,capsule.digest,receipts]));
      const coordinates=instrumentCoordinates(fold.store,processOf('verb'),[],ownRoot(),ownLock(),true),instrument=hash([...coordinates.values()].sort().join('\n'));
      const legacy=target.legacy;
      return requests.flatMap(request=>{
        const execution=readingExecution({instrument,implementation:capsule.digest,policy:hash(JSON.stringify([contentPolicy(),capsule.selection??null,capsule.lines])),inputs:[['world',capsule.selection??capsule.digest],['batch',batch],['request',hash(JSON.stringify(request))],...legacy,...[...coordinates].map(([name,id])=>['host/'+relative(ownRoot(),name),id] as const)]},hash,{env:process.env,cwd:fold.root,flags:childFlags()});
        const closure=new TextDecoder().decode(readingIdentityBytes(execution.context)),input=hash(closure),said=withReadingBoundary(input,execution,()=>capsule.ask([request]))[0];
        if(said?.kind!=='fact')throw Error(`REFUSE·capsule ${capsule.digest} · ${request.region} · ${said?.why??'no answer'}`);
        const by=speaker+':'+batch.slice(7),at='place:'+input;
        const lines=(said.claims??[]).map((row:any)=>canonical({scope:row.scope,role:row.role,measure:row.measure,form:row.bound.kind==='interval'?'interval':'alphabet',value:row.bound.kind==='interval'?`${row.bound.lo??0}..${row.bound.hi??0}`:(row.bound.values??[]).join('|'),by,at}));
        const output=lines.join('\n')+(lines.length?'\n':''),scope='receipts/readings/'+hash(request.region??'').slice(7)+'/'+input.slice(7);
        return [canonical({scope:place,role:'writes',form:'alphabet',measure:'observed',value:input.slice(7,23),by,at}),...lines,...portableReadingReceipt(scope,by,closure,output,hash)];
      });
    }
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

/** Current judgement excludes authenticated outcomes of the selected producer batches; retained evidence stays in its carrier. */
export const currentReceiptObservations = (fold: Parameters<typeof capsulesOf>[0]):readonly string[] => modernReceiptInputs(fold).current;

/** Preserve prior producer outcomes in the owning place's public carrier, independently of current judgement. */
export const retiredReceiptHistory = (fold: Parameters<typeof capsulesOf>[0]):readonly string[] => { const carried=carriedFrom(fold.store,(observeText(join(fold.root,fold.under??'','receipts.bound'))??'').split('\n').filter(line=>line.startsWith('bound-lock/')))??[]; const all=[...new Set([...fold.observed,...carried])],current=new Set(modernReceiptInputs({...fold,observed:all}).current);return all.filter(line=>!current.has(line)); };

/** A modern capsule batch cannot consume its own retained outcomes. Full context units bind history; legacy conversion never supplies a current answer. */
function modernReceiptInputs(fold:Placed,target?:string):{current:readonly string[];legacy:readonly (readonly[string,string])[]}{
 if(!readingProfile(fold.standing,fieldOf))return{current:fold.observed,legacy:[]};
 const observed=[...new Set(fold.observed)];
 const hash=receiptHasher(fold.store),allSelected=capsulesOf(fold),selected=allSelected.filter(c=>{const writing=new Set(c.lines.filter(l=>fieldOf(l,'measure')==='writes').map(l=>fieldOf(l,'scope').slice(7)));return Object.keys(c.declaration.writes).some(n=>c.declaration.writes[n]==='receipt'&&!writing.has(n));});
 if(!selected.length)return{current:fold.observed,legacy:[]};
 const speaker=keyFor(fold.store,'read'),removed=new Set<string>(),refs:(readonly[string,string])[]=[];
 const units=observed.filter(l=>fieldOf(l,'scope').startsWith('receipts/readings/')&&fieldOf(l,'measure')==='bytes'&&fieldOf(l,'role')==='writes');
 if(verifiedReadingReceipts(fold.store,observed,hash,undefined,true)===undefined)throw Error('REFUSE·capsule receipt carrier context invalid');
 for(const capsule of selected){
  if(target!==undefined&&(capsule.selection??capsule.digest)!==target)continue;
  const writing=new Set(capsule.lines.filter(l=>fieldOf(l,'measure')==='writes').map(l=>fieldOf(l,'scope').slice(7))),receipts=Object.keys(capsule.declaration.writes).filter(n=>capsule.declaration.writes[n]==='receipt'&&!writing.has(n)).sort();if(!receipts.length)continue;
  const batch=hash(JSON.stringify([capsule.selection??capsule.digest,capsule.digest,receipts])),knownLegacy=new Set<string>();
  for(const unit of units){const about=fieldOf(unit,'about');if(!about)continue;let c:any;try{c=JSON.parse(about)}catch{continue}if(!Array.isArray(c)||c[0]!=='reading-context@1'||c[2]!==capsule.digest||!Array.isArray(c[4])||!c[4].some(([n,id]:any)=>n==='batch'&&id===batch)||!c[4].some(([n,id]:any)=>n==='world'&&id===(capsule.selection??capsule.digest)))continue;
   const expectedBy=speaker+':'+batch.slice(7);if(fieldOf(unit,'by')!==expectedBy)continue;if(fold.standing.some(line=>fieldOf(line,'scope')==='keys/'+expectedBy&&fieldOf(line,'value')!=='withdraw'))throw Error('REFUSE·modern capsule receipt producer ambiguous');
   const namedScope=fieldOf(unit,'scope'),inputIdentity=fieldOf(unit,'value');if(!receipts.some(name=>namedScope==='receipts/readings/'+hash(name).slice(7)+'/'+inputIdentity.slice(7)))throw Error('REFUSE·modern capsule receipt scope differs from declared region');
   for(const[n,id]of c[4])if(typeof n==='string'&&n.startsWith('legacy/output/')&&n==='legacy/output/'+id){knownLegacy.add(id);refs.push([n,id]);}
   const by=fieldOf(unit,'by'),input=fieldOf(unit,'value'),scope=fieldOf(unit,'scope'),output=observed.find(l=>fieldOf(l,'scope')===scope&&fieldOf(l,'by')===by&&fieldOf(l,'measure')==='count');
   const payload=output?fieldOf(output,'at'):'';for(const l of observed)if(fieldOf(l,'by')===by&&(fieldOf(l,'at')==='place:'+input||fieldOf(l,'at')===payload||fieldOf(l,'scope')===scope||fieldOf(l,'scope')===[scope,'identity'].join('/')))removed.add(l);
  }
  const alias=capsule.digest.slice(7,19),by=speaker+':'+alias,groups=new Map<string,string[]>();for(const l of observed)if(fieldOf(l,'by')===by){const at=fieldOf(l,'at');groups.set(at,[...(groups.get(at)??[]),l]);}
  if(groups.size){if(selected.filter(c=>c.digest===capsule.digest).length!==1||receipts.length!==1||new Set(allSelected.filter(c=>c.digest.slice(7,19)===alias).map(c=>c.digest)).size!==1||fold.standing.some(l=>fieldOf(l,'scope')==='keys/'+by&&fieldOf(l,'value')!=='withdraw'))throw Error('REFUSE·legacy capsule receipt producer ambiguous');
   for(const[at,group]of groups){if(!/^place:sha256:[a-f0-9]{64}$/.test(at)||group.filter(l=>fieldOf(l,'measure')==='observed'&&fieldOf(l,'scope')===(fold.under||'./')).length!==1)throw Error('REFUSE·legacy capsule receipt occurrence ambiguous');const id=hash(group.join('\n'));if(!knownLegacy.has(id)){
     const candidate=observed.filter(l=>!removed.has(l)&&!group.includes(l)),request=askingOf({...fold,observed:candidate})(capsule.declaration,{name:receipts[0]!,at:3},'read','');if(!request||at!=='place:'+hash(JSON.stringify(request)))throw Error('REFUSE·legacy capsule receipt context unavailable · expected '+at+' · current '+(request?hash(JSON.stringify(request)):'absent')); 
    }refs.push(['legacy/output/'+id,id]);for(const l of group)removed.add(l);
   }
  }
 }
 return{current:observed.filter(l=>!removed.has(l)),legacy:[...new Map(refs.map(([n,id])=>[n+' '+id,[n,id] as const])).values()]};
}
