import { timing } from '../host/timing.ts';
import {attestationObservations} from '../fold/evidence.ts';
import {parse as parseEvidenceFields} from '@lapxo/topos/wire';
import { releasePolicy, releaseFaults } from '../fold/release-policy.ts';
import type { ReleasePolicyResult } from '../fold/release-policy.ts';
import { point, region, within } from '@lapxo/obligations/field';
import type { Fork } from '../fold/claims.ts';
import { basename, join } from 'node:path';
import { observeText } from '../observe/files.ts';
import { placesOf, viewsOf } from '../fold/views.ts';
import type { View } from '../fold/views.ts';
import { prerender, viewOf } from '../render/view.ts';
import { meets } from '../fold/closed.ts';
import { foldPoints, keepFold, keptPlace } from '../fold/kept.ts';
import { openCells } from '../render/open.ts';
import { boundOf, packRegions, regionsNamed, regionsOf, unlikeReplay } from '../fold/region.ts';
import type { Packed } from '../fold/region.ts';
import type { OpenCell } from '../render/open.ts';
import { answersElsewhere, foldCeilings } from '../fold/ceilings.ts';
import type { CeilingFold } from '../fold/ceilings.ts';
import { keyOf, keyFor, lockLines, lockStanding } from '../fold/keys.ts';
import { wordFrom, wordOf, wordOn } from '../fold/wire.ts';
import { bytesDigest, instrumentOf, signaturesOf } from '../fold/digests.ts';
import { claimKey, fieldOf, fieldsOf, isWire } from '../fold/claims.ts';
import { canonical, LOCK, parse } from '@lapxo/topos/wire';
import { classDefaults, kindsOf, placesIn, spoken } from '../fold/places.ts';
import { isCeiling } from '../fold/configures.ts';
import { observedClaims, placedReadings } from '../fold/observed.ts';
import { capsuleReadingsOver } from '../observe/regions.ts';
import { costReadings, ownReadings } from '../fold/own.ts';
import { paidOf } from '../fold/paid.ts';
import { rolesOf } from '../fold/roles.ts';
import { secondHead } from '../fold/second.ts';
import type { SecondHead } from '../fold/second.ts';
import { authorityFor, rootSigner, writerFor } from '../fold/signers.ts';
import { ledgerLines, storeOf } from '../land/ledger.ts';
import { vouchedCoordinates } from '../land/vouched.ts';
import { ownLock, ownRoot } from '../observe/runner.ts';
import { renderTarget } from '../render/target.ts';
import { epochOf, historyOf, renderedLock, standingDemands } from './owner.ts';

/**
 * Everything the fold knows about one place of the tree, or about the whole tree: what every region is rendered from,
 * whether it was read back from a key already answered rather than taken again, and the middle of the last ten folds
 * of this place, those that had to fold apart from those that read. A region whose points are ledger lines that move
 * at every beat is judged when it is read and never kept: a kept fold answers for the regions whose digest is in its
 * key and for no others.
 */
export interface PlaceFold {
  readonly release?: ReleasePolicyResult;
  readonly root: string;
  readonly store: string;
  readonly under?: string;
  readonly epoch: number;
  readonly standing: readonly string[];
  readonly claims: number;
  readonly forks: readonly Fork[];
  readonly grey: readonly string[];
  readonly refused: readonly string[];
  readonly vacuous: number;
  readonly demands: readonly string[];
  readonly paid: readonly string[];
  readonly missing: readonly string[];
  readonly history: readonly string[];
  readonly observed: readonly string[];
  readonly ceilings: {
    readonly read: number;
    readonly total: number;
    readonly unread: readonly string[];
    readonly vacuous: readonly string[];
    readonly short: readonly string[];
    readonly over: readonly string[];
  };
  readonly orphans: readonly string[];
  readonly lock: number;
  readonly signed: ReadonlyMap<string, number>;
  readonly second: SecondHead;
  readonly effects: string;
  readonly costs: readonly number[];
  readonly landed: number;
  readonly kept?: boolean;
  readonly key: string;
  readonly instrument: string;
  readonly own: Readonly<Record<string, number>>;
  readonly open: readonly OpenCell[];
  readonly beats: { readonly kept: number; readonly folded: number };
  readonly regions?: Packed;
}

function beatsOf(store: string, standing: readonly string[], under?: string): { kept: number; folded: number } {
  const folder = writerFor(standing, 'fold');
  const middle = (at: string): number => {
    const ms = (folder === undefined ? [] : ledgerLines(store, folder))
      .filter((line) => fieldOf(line, 'scope') === `beat/${under ?? '.'}` && fieldOf(line, 'at') === `place:${at}`)
      .map((line) => Number(fieldOf(line, 'value').split('..')[0])).filter((one) => Number.isFinite(one)).slice(-10).sort((a, b) => a - b);
    return ms.length ? ms[Math.floor(ms.length / 2)] ?? 0 : 0;
  };
  return { kept: middle('kept'), folded: middle('folded') };
}

const costsOf = (store: string): readonly number[] => ledgerLines(store, 'take').filter((line) => fieldOf(line, 'measure') === 'ms')
  .map((line) => Number(fieldOf(line, 'value').split('..')[0])).filter((ms) => Number.isFinite(ms)).slice(-10);

function effectStates(_store: string): string {
  return 'none';
}

function listed(misses: readonly { readonly ceiling: string; readonly question: string; readonly got: string }[]): string[] {
  const by = new Map<string, string[]>();
  for (const o of misses) by.set(o.ceiling, [...(by.get(o.ceiling) ?? []), o.question === o.ceiling ? o.got : `${o.question}=${o.got}`]);
  return [...by].map(([scope, got]) => `${scope} · ${got.length > 4 ? `${got.slice(0, 4).join(' ')} +${got.length - 4}` : got.join(' ')}`);
}

/**
 * The fold of a place: the standing lock and what readers saw, narrowed to the place when one is named. A demand is the
 * place's when every place it asks about lies there; a SHORT on a question also read outside it is not the place's to
 * answer. The count of a place's own readings is the instrument's, taken inside the place alone. What each key has
 * signed that stands is counted apart: the owner's lines stand in this fold, a second head's in its own ledger, and its
 * word on a lock is asked once for the lines a batch and the ledger own together.
 */
const counted = new WeakMap<readonly string[], number>();
const seconds = new WeakMap<readonly string[], SecondHead>();

function secondOf(root: string, store: string, attested: readonly string[], owned: readonly string[]): SecondHead {
  const held = seconds.get(owned);
  if (held !== undefined) return held;
  const head = keyOf(store, 'attest');
  const heard = head === undefined ? undefined : authorityFor([...owned, ...ledgerLines(store, head)], rootSigner(root), signaturesOf(store).admitted);
  return seconds.set(owned, secondHead(store, attested, (line) => heard?.of(line).kind === 'admitted', owned)).get(owned)!;
}

function signedByKey(store: string, standing: readonly string[], observed: readonly string[]): ReadonlyMap<string, number> {
  const signed = new Map<string, number>();
  const reader = (() => {
    try {
      return keyFor(store, 'read');
    } catch {
      return undefined;
    }
  })();
  for (const line of standing) signed.set(fieldOf(line, 'by'), (signed.get(fieldOf(line, 'by')) ?? 0) + 1);
  for (const line of standing) {
    const key = /^keys\/([^/]+)$/.exec(fieldOf(line, 'scope'))?.[1];
    const lines = key === undefined || signed.has(key) ? undefined : key === reader ? observed : ledgerLines(store, key);
    if (key !== undefined && lines !== undefined) signed.set(key, counted.get(lines) ?? counted.set(lines, new Set(lines.filter(line => fieldOf(line, 'sig') !== '')).size).get(lines)!);
  }
  return signed;
}

/** Generic view checks: declared output equality and one writer per coordinate. Domain measurements belong to selected providers. */
function viewReadings(place: PlaceFold): { readonly readings: Readonly<Record<string, number>>; readonly same: ReadonlySet<string>; readonly here: ReadonlySet<string> } {
  const leaf = wordOn(place.standing, 'region-leaf', ownLock());
  const at = (coordinate: string): string => join(place.root, place.under ?? '', coordinate);
  const every = [...viewsOf(place.standing).values()].flatMap((view) => ('regions' in view && view.shape ? [view] : []))
    .filter((view) => observeText(at(view.shape)) !== undefined);
  const named = (view: View): boolean => placesOf(place.standing, view).includes(place.under ?? '');
  const shaped = every.filter((view) => named(view) || (!placesOf(place.standing, view).length && !every.some((other) => other.shape === view.shape && named(other))));
  prerender(place, shaped);
  const same = new Set(shaped.filter((view) => observeText(at(view.shape)) === viewOf(place, view)).map((view) => view.name));
  const differ = shaped.length - same.size;
  const twice = [...every.filter((view) => named(view) || !placesOf(place.standing, view).length)
    .reduce((by, view) => by.set(view.shape, (by.get(view.shape) ?? 0) + 1), new Map<string, number>()).values()].filter((n) => n > 1).length;
  return { readings: { [`rendered-${leaf}-differ`]: differ, 'rendered-coordinates-differ': differ, [`${leaf}-with-two-views`]: twice, 'coordinates-with-two-views': twice }, same, here: new Set(shaped.map(view => view.name)) };
}

const NONE: readonly string[] = [];
const ownings = new WeakMap<readonly string[], WeakMap<readonly string[], readonly string[]>>();
const ownedOf = (store: string, told: readonly string[]): readonly string[] => ((lock) => ((byLock) => byLock.get(told) ?? byLock.set(told, [...lock, ...told]).get(told)!)(
  ownings.get(lock) ?? ownings.set(lock, new WeakMap()).get(lock)!))(lockLines(store));

export function standingOf(root: string, under?: string, told: readonly string[] = NONE): { readonly standing: readonly string[]; readonly lock: readonly string[]; readonly rendered: ReturnType<typeof renderTarget>; readonly owned: readonly string[] } {
  const store = storeOf(root);
  const owned = ownedOf(store, told);
  const rendered = renderedLock(root, store, told);
  const lock = rendered.text.split('\n').filter(isWire);
  const said = spoken(root);
  if (!said.length) return { standing: lock, lock, rendered, owned };
  const views = `${wordOf(lock, 'families', 'view')}/`;
  const isView = (line: string): boolean => fieldOf(line, 'scope').startsWith(views);
  const ruled = new Set(said.filter((one) => !isView(one.line)).map((one) => claimKey(one.line)));
  const owners = new Map<string, Set<string>>();
  for (const one of said.filter((o) => isView(o.line))) owners.set(fieldOf(one.line, 'scope'), (owners.get(fieldOf(one.line, 'scope')) ?? new Set<string>()).add(`${one.place}/`));
  const tree = lock.flatMap((line) => {
    const by = isView(line) ? owners.get(fieldOf(line, 'scope')) : undefined;
    if (by === undefined) return ruled.has(claimKey(line)) ? [] : [line];
    const needs = fieldOf(line, 'needs').split('|').filter(Boolean);
    const left = needs.filter((need) => ![...by].some((place) => need.startsWith(place)));
    if (!needs.length || left.length === needs.length) return [line];
    const got = parse(line);
    return left.length && got.kind === 'fact' ? [canonical({ ...got.value.fields, needs: left.join('|') })] : [];
  });
  const here = under?.replace(/\/$/, '');
  const first = said.filter((one) => one.place === here).map((one) => one.line);
  const rest = said.filter((one) => one.place !== here).map((one) => one.line);
  const standing = [...new Set([...first, ...tree, ...rest])];
  return { standing: [...standing, ...inheritedOf(root, standing)], lock, rendered, owned };
}

function inheritedOf(root: string, standing: readonly string[]): readonly string[] {
  const defaults = classDefaults(root);
  if (!defaults.length) return [];
  const held = standing.filter(isCeiling);
  const extra: string[] = [];
  for (const place of placesIn(root)) {
    const kinds = kindsOf(root, place);
    const prefix = `${place}/`;
    const measures = new Set(held.filter((line) => fieldOf(line, 'scope').startsWith(prefix)).map((line) => fieldOf(line, 'measure')));
    for (const def of defaults) {
      if (!def.classes.includes('*') && !def.classes.some((kind) => kinds.includes(kind))) continue;
      const measure = fieldOf(def.line, 'measure');
      if (measures.has(measure)) continue;
      const got = parse(def.line);
      if (got.kind !== 'fact') continue;
      extra.push(canonical({ ...got.value.fields, scope: `${prefix}${fieldOf(def.line, 'scope')}` }));
      measures.add(measure);
    }
  }
  return extra;
}

export function coneOf(root: string, entry: string, ceilings: readonly string[], descent?: readonly string[]): { readonly standing: readonly string[]; readonly observed: readonly string[]; readonly own: Readonly<Record<string, number>>; readonly kept: boolean } {
  const store = storeOf(root);
  const { standing, rendered } = standingOf(root);
  const named = regionsNamed(standing);
  const reach = descent !== undefined && descent.length ? [...descent] : [...new Set(ceilings.map((line) => boundOf(named, line).region))];
  const read = observedClaims(root, store, { wait: false, ...(reach.includes('') ? {} : { reach }) });
  const observed = [...read, ...capsuleReadingsOver({ root, store, standing, observed: read })];
  const own = {
    ...ownReadings({ root, store, entry, roleOf: rolesOf(store), standing, observed, unadmitted: rendered.grey.length + rendered.refused.length, orphans: 0 }),
    ...costReadings(store, standing),
  };
  const measured = new Set([...Object.keys(own), ...placedReadings(observed).map((reading) => reading.measure), wordOf(standing, 'states', 'unread')]);
  const reached = ceilings.every((line) => measured.has(fieldOf(line, 'measure')) || fieldOf(line, 'scope') in own);
  if (reached) return { standing, observed, own, kept: true };
  const whole = foldPlace(root, entry);
  return { ...whole, kept: whole.kept ?? false };
}

export const ownCeilings = (under?: string): readonly string[] => ((home) => (under === undefined || under === `${home}/`
  ? ownLock().filter(isCeiling).map((line) => canonical({ ...fieldsOf(line), scope: `${home}/${fieldOf(line, 'scope')}` })) : []))(basename(ownRoot()));

export function foldPlace(root: string, entry: string, under?: string, look = true, given?: { readonly standing: ReturnType<typeof standingOf>; readonly observed: readonly string[]; readonly free?: boolean }): PlaceFold {
  const store = storeOf(root);
  const digestAt = Date.now();
  const closed = meets(root, store, under ?? '');
  const digestMs = Date.now() - digestAt;
  if (closed && given?.free !== true) {
    const prior = keptPlace(store, under);
    if (prior !== undefined) {
      process.stderr.write(`CLOSED   ${under || '.'} · digest ${digestMs} ms\n`);
      return { ...prior, kept: true };
    }
  }
  const { standing, lock: attested, rendered, owned } = given?.standing ?? standingOf(root, under);
  const folder = writerFor(standing, 'fold');
  const answered = given === undefined && under ? new Map<string, string>() : undefined;
  const reached = given?.observed ?? observedClaims(root, store, { wait: look, ...(under ? { reach: [under], answered } : {}) });
  const self = instrumentOf(store, entry, standing, root, ownLock());
  const inside = (place: string): boolean => !under || within(point(place.replace(/\/\*$/, '')), region(under));
  const history = historyOf(root, store, standingDemands(store));
  const theirs = history.live.filter((line) => ((needs) => !under || (needs.length > 0 && needs.every(inside)))(fieldOf(line, 'needs').split('|').filter(Boolean)));
  const reads = under && under !== `${basename(ownRoot())}/` ? { owned, place: under, scopes: new Set(theirs.map((line) => fieldOf(line, 'scope'))) } : undefined;
  const spent: string[] = [];
  const took = timing(spent);
  const read = given?.observed ?? (under ? took('observe', () => observedClaims(root, store, { wait: look })) : reached);
  const everywhere = [...read, ...took('capsules', () => capsuleReadingsOver({ root, store, ...(under ? { under } : {}), standing, observed: read }))];
  const points = foldPoints(store, standing, under, folder, self, reached, root, answered, reads);
  const taken = bytesDigest(store, new TextEncoder().encode(points.join('\n'))).replace(/^sha256:/, '');
  const observed = everywhere.filter((line) => !/ measure=observed /.test(line) || inside(fieldOf(line, 'scope')));
  const shared = new Set(under ? placedReadings(everywhere).filter((r) => !inside(r.place)).map((r) => r.question) : []);
  const live = history;
  const demands = theirs;
  const orphans: readonly string[] = [];
  const ceilings = [...standing.filter((line) => isCeiling(line) && !(under && fieldOf(line, 'measure') === 'unread')), ...ownCeilings(under)];
  const own = took('own', () => ownReadings({
    root, store, entry, roleOf: rolesOf(store), standing, observed: everywhere,
    unadmitted: rendered.grey.length + rendered.refused.length, orphans: orphans.length, ...(under ? { under } : {}),
  }));
  const regions = took('regions', () => regionsOf(standing, ceilings.filter((line) => !answersElsewhere(line, own, under, new Set(placesIn(root)))), placedReadings(observed)));
  const fold = (docs: Readonly<Record<string, number>>): CeilingFold =>
    foldCeilings({ standing, ceilings, observed, own: { ...own, ...docs }, epoch: epochOf(owned), ...(under ? { under, places: new Set(placesIn(root)) } : {}) });
  const folded = took('ceilings', () => fold({}));
  const { paid, missing } = took('paid', () => paidOf(store, demands, observed, `${wordFrom(standing, 'families', 'view', lockStanding(store))}/`));
  const lock = (observeText(join(root, under ?? '', LOCK)) ?? '').split('\n').filter(isWire).length;
  const second = secondOf(root, store, attested, owned);
  const policyStanding = standing.filter((line) => !rendered.grey.includes(line) && !rendered.refused.includes(line));
  const faults = releaseFaults({ forks: rendered.forks, refused: rendered.refused, grey: rendered.grey, orphans, second });
  const place: PlaceFold = {
    release: releasePolicy({ standing: policyStanding, demands, paid, ceilings, readings: folded, faults, verdicts:attestationObservations(policyStanding.map(line=>{const r=parseEvidenceFields(line);return r.kind==='fact'?r.value.fields:{};}),second), snapshot: { fold: taken, instrument: self } }),
    root, store, ...(under ? { under } : {}), epoch: epochOf(owned), standing, claims: rendered.standing,
    forks: rendered.forks, grey: rendered.grey, refused: rendered.refused, vacuous: rendered.vacuous.length,
    demands, paid, missing,
    history: live.history.filter((line) => fieldOf(line, 'needs').split('|').filter(Boolean).some(inside)),
    observed,
    ceilings: {
      read: folded.read.length,
      total: ceilings.length,
      unread: folded.unread.map((line) => fieldOf(line, 'scope')),
      vacuous: folded.vacuous.map((line) => fieldOf(line, 'scope')),
      short: listed(folded.over.filter((o) => o.side === 'short' && !shared.has(o.question))),
      over: listed(folded.over.filter((o) => o.side === 'over')),
    },
    orphans,
    lock,
    signed: signedByKey(store, standing, everywhere),
    second,
    effects: effectStates(store),
    key: taken,
    instrument: self,
    own,
    open: openCells({ store, standing, observed, grey: rendered.grey, epoch: epochOf(owned) }),
    regions: packRegions(regions),
    beats: beatsOf(store, standing, under),
    landed: [...vouchedCoordinates(store).keys()].filter((coordinate) => !under || coordinate.startsWith(under)).length,
    costs: costsOf(store),
  };
  const { readings: found, same, here } = took('docs', () => viewReadings(place));
  const family = `${wordFrom(standing, 'families', 'view', lockStanding(store))}/`;
  const coordinates = new Set([...here].map((name) => `${family}${name}`));
  const writes = (line: string): boolean => coordinates.has(fieldOf(line, 'scope'));
  const holds = (line: string): boolean => same.has(fieldOf(line, 'scope').slice(family.length));
  const owed = [...place.missing.filter((line) => !writes(line) || !holds(line)), ...place.paid.filter((line) => writes(line) && !holds(line))];
  const docs = {
    ...found, 'payments-lost-on-equal-output': owed.filter((line) => writes(line) && holds(line)).length,
    'poles-unlike-replay': unlikeReplay(regions, new Set(folded.over.map((one) => one.ceiling)), { ...own, unread: folded.unread.length + folded.vacuous.length }),
  };
  const again = took('ceilings', () => fold(docs));
  const finalPaid = [...place.paid.filter((line) => !writes(line) || holds(line)), ...place.missing.filter((line) => writes(line) && holds(line))];
  const whole: PlaceFold = {
    ...place,
    paid: finalPaid,
    release: releasePolicy({ standing: policyStanding, demands, paid: finalPaid, ceilings, readings: again, faults, verdicts:attestationObservations(policyStanding.map(line=>{const r=parseEvidenceFields(line);return r.kind==='fact'?r.value.fields:{};}),second), snapshot: { fold: taken, instrument: self } }),
    missing: owed,
    own: { ...place.own, ...docs },
    ceilings: {
      ...place.ceilings,
      read: again.read.length,
      unread: again.unread.map((line) => fieldOf(line, 'scope')),
      vacuous: again.vacuous.map((line) => fieldOf(line, 'scope')),
      short: listed(again.over.filter((o) => o.side === 'short' && !shared.has(o.question))),
      over: listed(again.over.filter((o) => o.side === 'over')),
    },
  };
  if (folder !== undefined && closed) took('keep', () => keepFold(store, taken, whole, points, self));
  process.stderr.write(`SPENT    fold ${spent.join(' ms · ')} ms\n`);
  return whole;
}
