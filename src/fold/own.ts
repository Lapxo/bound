import { basename, existsSync, relative, resolve } from '../host/io.ts';
import { EXTENSION, matches } from '@lapxo/topos/wire';
import { fieldOf, isWire } from './claims.ts';
import { wordsOf } from './wire.ts';
import type { CoordinateRole } from './wire.ts';
import { inheritedRoles, stepsOutside } from './roles.ts';
import { writerFor } from './signers.ts';
import { isCeiling } from './configures.ts';
import { keyOf } from './keys.ts';
import { VERB_NAMES } from '../cli/names.ts';
import { actSeconds, idleCount, receiptsSeen } from './closed.ts';
import { foldsElsewhere } from './kept.ts';
import { ledgerLines } from '../land/ledger.ts';
import { vouchedCoordinates } from '../land/vouched.ts';
import { placedReadings, readerLines, readerModules } from './observed.ts';
import { storeDirs } from '../host/ports/store.ts';
import { entriesIn, observeText } from '../observe/files.ts';
import { placesOf, viewsOf } from './views.ts';
import { declaredBy } from '../observe/regions.ts';
import { REGION_NAMES } from '../render/names.ts';
import { ownLock, ownRoot } from '../observe/runner.ts';
import { namingTheirPlace, zoomedOutsideThePlace } from './zoom.ts';
import { resetsOnEqualEmits, withoutVectors } from '../observe/identity.ts';
import { instrumentCoordinates } from './digests.ts';
import { bugsWithoutANo } from './nos.ts';
import { writtenIn } from './signed.ts';
import { laidDiffers } from './laid.ts';
import { heldBytes } from '../land/held.ts';
import { capsuleAt, placesIn, worldAt } from './places.ts';

type RoleOf = (coordinate: string) => CoordinateRole;

const entered = { foreign: 0 };

/** Host and instrument measurements. Domain contracts require their selected readers; missing readings are not fabricated zeroes. */
function shipped(root: string, store: string, standing: readonly string[], under?: string): number {
  const shape = [...viewsOf(standing).values()].flatMap((view) => ('regions' in view && view.shape ? [view.shape] : []))
    .find((coordinate) => coordinate.endsWith(EXTENSION));
  if (shape === undefined) return 0;
  const outside = stepsOutside(store);
  const places = under ? [under] : ['', ...entriesIn(resolve(root)).filter((entry) => entry.dir && !outside.has(entry.name)).map((entry) => `${entry.name}/`)];
  const ships = (): readonly string[] => wordsOf(standing, 'ships');
  entered.foreign = 0;
  return Math.max(0, ...places.map((place) => (ships().includes(shape) ? (observeText(resolve(root, place, shape)) ?? '').split('\n').filter(isWire).length : 0)));
}

function unrenderedIn(root: string, store: string, standing: readonly string[], observed: readonly string[]): number {
  const views = [...viewsOf(standing).values()].flatMap((view) => ('regions' in view && view.shape ? [view] : []));
  const own = new Set<string>(REGION_NAMES);
  const missing = new Set<string>();
  for (const place of ['', ...placesIn(root).map((one) => `${one}/`)]) {
    const declared = declaredBy({ root, store, standing, observed, ...(place ? { under: place } : {}) });
    const here = views.filter((view) => ((at) => (at.length ? at.includes(place) : observeText(resolve(root, place, view.shape)) !== undefined))(placesOf(standing, view)));
    for (const region of here.flatMap((view) => view.regions)) if (!own.has(region.name) && !declared.some((glob) => matches(glob, region.name))) missing.add(`${place}${region.name}`);
  }
  return missing.size;
}

function removedByHand(root: string, store: string, under?: string): number {
  return [...vouchedCoordinates(store).keys()].filter((coordinate) => (!under || coordinate.startsWith(under)) && !existsSync(resolve(root, coordinate))).length;
}

function readersOverFirstRun(store: string): number {
  const runs = new Map<string, number[]>();
  for (const line of readerLines(store)) {
    const scope = fieldOf(line, 'scope');
    if (!scope.startsWith('cost/reader/') || !/^place:[0-9a-f]{64}$/.test(fieldOf(line, 'at'))) continue;
    const key = `${scope} ${fieldOf(line, 'by')} ${fieldOf(line, 'at')}`;
    runs.set(key, [...(runs.get(key) ?? []), Number(fieldOf(line, 'value').split('..')[0])]);
  }
  return [...runs.values()].filter((ms) => ms.length > 1 && ms[ms.length - 1]! > ms[0]!).length;
}

function attestBeat(store: string, standing: readonly string[]): number | undefined {
  const head = keyOf(store, 'attest');
  if (head === undefined) return undefined;
  return middleBeat(store, standing, `${head}/beat`, 'folded', head);
}

function twiceWritten(observed: readonly string[]): number {
  const places = new Map<string, Set<string>>();
  for (const reading of placedReadings(observed)) {
    if (!reading.question.startsWith('concept/')) continue;
    places.set(reading.question, (places.get(reading.question) ?? new Set()).add(reading.place));
  }
  return [...places.values()].filter((held) => held.size > 1).length;
}

function counted(store: string, standing: readonly string[], scope: string, at: string): number {
  const folder = writerFor(standing, 'fold');
  if (folder === undefined) return 0;
  return ledgerLines(store, folder)
    .filter((line) => fieldOf(line, 'scope') === scope && /place:(folded|kept)$/.test(fieldOf(line, 'at')))
    .slice(-10)
    .filter((line) => fieldOf(line, 'at') === `place:${at}`).length;
}

function middleBeat(store: string, standing: readonly string[], scope: string, at: string, signer?: string): number | undefined {
  const folder = signer ?? writerFor(standing, 'fold');
  if (folder === undefined) return undefined;
  const ms = ledgerLines(store, folder)
    .filter((line) => fieldOf(line, 'scope') === scope && fieldOf(line, 'at') === `place:${at}`)
    .map((line) => Number(fieldOf(line, 'value').split('..')[0]))
    .filter((one) => Number.isFinite(one))
    .slice(-10)
    .sort((a, b) => a - b);
  return ms[Math.floor(ms.length / 2)];
}

function alphabetsInCode(observed: readonly string[], standing: readonly string[], under?: string): number {
  const signed = standing
    .filter((line) => fieldOf(line, 'form') === 'alphabet')
    .map((line) => fieldOf(line, 'value'))
    .filter((value) => value !== 'withdraw' && !value.startsWith('not:'))
    .map((value) => new Set(value.split('|').filter(Boolean)))
    .filter((alphabet) => alphabet.size > 1);
  const crossing = placedReadings(observed)
    .filter((reading) => reading.question === 'alphabet' && reading.measure === 'id' && (!under || reading.place.startsWith(under)))
    .filter((reading) => signed.some((alphabet) => reading.value.split('|').every((member) => alphabet.has(member))));
  return new Set(crossing.map((reading) => `${reading.place} ${reading.value}`)).size;
}

const ceilingsNamed = (standing: readonly string[], name: string): readonly string[] =>
  standing.filter((line) => isCeiling(line) && (fieldOf(line, 'measure') === name || fieldOf(line, 'scope').split('/').pop() === name));

const ownFrom = (line: string | undefined, name: string, value: number | undefined): Readonly<Record<string, number>> => {
  if (value === undefined) return {};
  const scope = fieldOf(line ?? '', 'scope');
  return { [name]: value, ...(scope && scope !== name ? { [scope]: value } : {}) };
};

const exporting = (observed: readonly string[], under: string, names: readonly string[]): number =>
  new Set(placedReadings(observed).filter((one) => one.place.startsWith(under) && names.some((name) => one.question === `export/${name}`)).map((one) => one.place)).size;

export const outsideTheirCapsule = (root: string, standing: readonly string[], lines: readonly string[]): readonly string[] => {
  const family = wordsOf(standing, 'families').find((one) => one === 'reader' || one === 'readers');
  return lines.filter((line) => (family === undefined || fieldOf(line, 'scope').startsWith(`${family}/`))
    && fieldOf(line, 'measure') === 'reader' && fieldOf(line, 'value') !== 'withdraw'
    && ((head) => !fieldOf(line, 'value').includes('/') || (capsuleAt(root, head) && !worldAt(root, head)))(fieldOf(line, 'value').split('/')[0] ?? ''));
};

const TREE: ReadonlySet<string> = new Set(['readers-over-their-first-run', 'stale-capsules', 'accept-line',
  'regions-described', 'walks-prune-by-role',
  'ledger-region-verdicts-served-from-a-kept-fold', 'kept-folds-read-under-another-instrument', 'accepts-that-refolded',
  'readers-without-vectors', 'lines-that-name-their-place', 'memo-resets-on-unchanged-extension', 'status-for-no-effect', 'accept-ms',
  'bodies-written-twice', 'world-lines-outside-their-capsule']);
const placeOnly = (readings: Readonly<Record<string, number | undefined>>, under?: string): Readonly<Record<string, number>> =>
  Object.fromEntries(Object.entries(readings).flatMap(([measure, value]) => (value === undefined || (under && TREE.has(measure)) ? [] : [[measure, value] as const])));

/**
 * What the instrument reads of itself rather than through a reader: how many programs its source opens, how many
 * signed lines stand unadmitted, how many stores it keeps, which of the modules it runs are no source, how many samples
 * nothing names, how many alphabets are spelled both in code and in the lock, and how many regions it writes that no
 * line of the lock describes, how many bodies are written twice anywhere in the tree rather than once and used by
 * digest, and whether the version a package carries is the one the lock names. Inside one package, only what lies
 * there. A cost is read now and never read back from the fold it was taken with: a beat is a line of the ledger.
 */
export function costReadings(store: string, standing: readonly string[], under?: string): Readonly<Record<string, number>> {
  return placeOnly({
    'beat-kept': middleBeat(store, standing, `beat/${under ?? '.'}`, 'kept'),
    'accept-line': middleBeat(store, standing, 'beat/accept', 'line'),
    'accept-ms': middleBeat(store, standing, 'beat/accept', 'total'),
    'accepts-that-refolded': counted(store, standing, 'beat/accept', 'folded'),
    'test-kept': under ? middleBeat(store, standing, `beat/${under}`, 'kept') : undefined,
    'programs-place': under ? middleBeat(store, standing, `beat/${under}`, 'command-kept') : undefined,
    ...(keyOf(store, 'attest') === undefined ? {} : {[`${keyOf(store, 'attest')}-ms`]: under ? undefined : attestBeat(store, standing)}),
  }, under);
}

export function ownReadings(input: {
  readonly root: string;
  readonly store: string;
  readonly entry: string;
  readonly roleOf: RoleOf;
  readonly standing: readonly string[];
  readonly observed: readonly string[];
  readonly unadmitted: number;
  readonly orphans: number;
  readonly under?: string;
}): Readonly<Record<string, number>> {
  const { root, store, entry, roleOf, standing, observed, under } = input;
  const spent: string[] = [];
  const took = <T>(what: string, fn: () => T): T => { const at = Date.now(); const got = fn(); spent.push(`${what} ${Date.now() - at}`); return got; };
  const instrument = under === undefined || under === `${basename(ownRoot())}/`;
  const tree = <T>(fn: () => T): T | undefined => (under ? undefined : fn());
  const imported = tree(() => took('imports', () => [...instrumentCoordinates(store, resolve(root, entry), standing, root, ownLock()).keys()]
    .filter((coordinate) => capsuleAt(root, relative(root, coordinate).split('/')[0] ?? '')).length));
  const twice = tree(() => took('bodies', () => twiceWritten(observed)));
  const local = {
    'orphan-samples': input.orphans,
    'removed-by-hand': took('removed', () => removedByHand(root, store, under)),
    'readers-over-their-first-run': tree(() => took('readers', () => readersOverFirstRun(store))),
    'alphabet-in-code': took('alphabets', () => alphabetsInCode(observed, standing, under)),
    'stale-capsules': tree(() => took('capsules', () => inheritedRoles(store).stale.length)),
    'beat-kept': middleBeat(store, standing, `beat/${under ?? '.'}`, 'kept'),
    'accept-line': tree(() => middleBeat(store, standing, 'beat/accept', 'line')),
    'accept-ms': tree(() => middleBeat(store, standing, 'beat/accept', 'total')),
    'test-kept': under ? middleBeat(store, standing, `beat/${under}`, 'kept') : undefined,
    'programs-place': under ? middleBeat(store, standing, `beat/${under}`, 'command-kept') : undefined,
    'regions-described': tree(() => took('regions', () => unrenderedIn(root, store, standing, observed))),
    'readers-without-vectors': tree(() => took('vectors', () => withoutVectors(root, readerModules(store), standing))),
    'lines-that-name-their-place': tree(() => took('zoom', () => namingTheirPlace(root))),
    ...(instrument ? {
      'bugs-without-a-no': took('nos', () => bugsWithoutANo(root, store, standing, basename(ownRoot()), 'bugs-without-a-no')),
      'zoom-rewrites-outside-the-place': took('zoomed', () => zoomedOutsideThePlace(root, standing)),
      'own-lines-written-in': took('applied', () => writtenIn(root, basename(ownRoot()))),
      'laid-digest-differs': took('laid', () => laidDiffers(store, ownRoot(), ownLock(), writerFor(standing, 'fold'))),
    } : {}),
    'memo-resets-on-unchanged-extension': tree(() => took('resets', () => resetsOnEqualEmits(readerLines(store)))),
    ...ownFrom(ceilingsNamed(standing, 'capsules-imported').find((line) => fieldOf(line, 'form') === 'interval'), 'capsules-imported', imported),
    ...((n) => ({ bytes: n, 'store/bytes': n }))(took('store', () => heldBytes(root, store, standing))),
    'walks-prune-by-role': entered.foreign,
    ...ownFrom(ceilingsNamed(standing, 'bodies-written-twice').find((line) => fieldOf(line, 'form') === 'interval'), 'bodies-written-twice', twice),
    ...Object.fromEntries(standing.filter((line) => isCeiling(line) && (fieldOf(line, 'measure') === 'render-modules' || fieldOf(line, 'scope').split('/').pop() === 'render-modules'))
      .flatMap((line) => ((place) => place === undefined ? [] : [[fieldOf(line, 'scope'), tree(() => exporting(observed, `${place}/`, ['render']))]])(fieldOf(line, 'scope').split('/').find((step) => capsuleAt(root, step))))),
    ...Object.fromEntries(standing.filter((line) => isCeiling(line) && (fieldOf(line, 'measure') === 'reader-modules' || fieldOf(line, 'scope').split('/').pop() === 'reader-modules'))
      .flatMap((line) => ((place) => place === undefined ? [] : [[fieldOf(line, 'scope'), tree(() => exporting(observed, `${place}/`, ['observe', 'run']))]])(fieldOf(line, 'scope').split('/').find((step) => capsuleAt(root, step))))),
    ...ownFrom(ceilingsNamed(standing, 'world-lines-outside-their-capsule').find((line) => fieldOf(line, 'form') === 'interval'), 'world-lines-outside-their-capsule', tree(() => outsideTheirCapsule(root, standing, standing).length)),
    idle: idleCount(),
    s: actSeconds(),
    'cli-verbs': VERB_NAMES.length,
    'walk-read': receiptsSeen().count,
    'walk-ms': receiptsSeen().ms,
    'kept-folds-read-under-another-instrument': tree(() => foldsElsewhere()),
    'accepts-that-refolded': tree(() => counted(store, standing, 'beat/accept', 'folded')),
    ...(keyOf(store, 'attest') === undefined ? {} : {[`${keyOf(store, 'attest')}-ms`]: tree(() => attestBeat(store, standing))}),
    ship: took('ship', () => shipped(root, store, standing, under)),
  };
  process.stderr.write(`OWN      ${spent.join(' ms · ')} ms\n`);
  if (under) return placeOnly(local, under);
  return {
    ...placeOnly(local),
    unadmitted: input.unadmitted,
    dirs: storeDirs(store),
    'artifacts-in-loop': [entry, ...readerModules(store)].filter((coordinate) => roleOf(coordinate) !== 'source').length,
  };
}
