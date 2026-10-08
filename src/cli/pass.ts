import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { ENVELOPE, canonical, parse } from '@lapxo/topos/wire';
import { foldPlace, standingOf } from './place.ts';
import type { PlaceFold } from './place.ts';
import { fieldOf, selfName } from '../fold/claims.ts';
import { observedClaims } from '../fold/observed.ts';
import { layReleases, resolvedOf } from '../host/release.ts';
import { ownLock, ownRoot, processOf } from '../observe/runner.ts';
import { landLaid } from '../fold/laid.ts';
import { actSeconds, closeReceipts, idleCount, instrumentKeep, instrumentKept, meets, noteIdle, receiptPlaces, receiptsSeen } from '../fold/closed.ts';
import { algorithmCost, instrumentOf, instrumentDigest } from '../fold/digests.ts';
import { writerFor } from '../fold/signers.ts';
import { defaulted, placesOf, viewsOf } from '../fold/views.ts';
import { ownLockOf } from '../fold/signed.ts';
import { worldAt, worldsIn } from '../fold/places.ts';
import { wordsOf } from '../fold/wire.ts';
import type { View } from '../fold/views.ts';
import { land, ledgerLines, replaceWhole, storeOf } from '../land/ledger.ts';
import { holdRoot, holds, underTheLock } from '../land/act.ts';
import { emptyLedger, sayStranger } from '../fold/stranger.ts';
import { entriesIn, observeFile, observeText } from '../observe/files.ts';
import { render, renderedOf, unrendered, viewOf } from '../render/view.ts';
import { releasePolicyLines } from '../fold/release-policy.ts';
import { carriedFrom } from '../fold/resolved.ts';
import { wireLine } from '../fold/wire.ts';
import { isWire, RECEIPTS } from '../fold/claims.ts';
import {withoutEffects} from '../host/read-only.ts';

/**
 * The pass of a place, in one process: the releases its instrument names are laid out first, its readers observe
 * once, each place a view writes in is folded once, the places before the root whose door reads them, and every coordinate a
 * view writes there is its render or is written again.
 * A round that wrote nothing ends the pass; one that made a coordinate or wrote one a region reads folds again, since what a
 * place shows may rest on what another renders — a coordinate rewritten that no region reads moves no page — and a third round
 * that still writes is named, never looped. With `--check` nothing is written; without it the pass holds the store,
 * and what it saw answer and lay lands by the key that writes folds: which capsule rendered each region of a view and
 * which release each dependency was laid from, each line once. What an act's gates saw answer lands only once its batch
 * has landed, and never when it is refused.
 */
/**
 * A check verifies existing receipts without running readers or refreshing hashes. Open regions or a different
 * instrument refuse; an admitted fold must establish closure before it can be checked.
 */
async function checked(root: string, entry: string, under: string | undefined): Promise<number> {
  const started = Date.now();
  const store = storeOf(root);
  if (!meets(root, store, under ?? '')) {
    process.stderr.write(`${selfName()}: REFUSE·check receipts are open; a fold must close them\n`);
    return 1;
  }
  const contract = wireLine(ownLock(), 'receipt-instrument');
  const evidence = carriedFrom(store, (observeText(join(root, under ?? '', RECEIPTS)) ?? '').split('\n').filter(isWire));
  const sealed = contract === undefined ? undefined : evidence?.find(line=>fieldOf(line,'scope')===fieldOf(contract,'value')&&fieldOf(line,'measure')==='digest');
  const expectedInstrument = sealed === undefined ? instrumentKept(store) : fieldOf(sealed,'value');
  if (!expectedInstrument) {
    process.stderr.write(`${selfName()}: REFUSE·check no verified instrument identity is available for these receipts\n`);
    return 1;
  }
  const standing = emptyLedger(store) ? ownLockOf(root,under?.replace(/\/$/,'') ?? '') : standingOf(root).standing;
  const instrument = sealed === undefined ? instrumentOf(store, entry, standing, root, ownLock()) : instrumentDigest(store,entry,[],ownRoot(),ownLock());
  if (expectedInstrument !== instrument) {
    process.stderr.write(`${selfName()}: REFUSE·check receipt instrument differs; a fold must close it\n`);
    return 1;
  }
  const read = receiptsSeen();
  const ms = Date.now() - started;
  if (under === undefined) process.stderr.write(`RECEIPTS ${read.count || receiptPlaces(root, store).length} read · 0 opened · ${ms} ms\n`);
  else process.stderr.write(`CLOSED   ${under} · ${ms} ms\n`);
  const seconds = actSeconds();
  process.stderr.write(`COST     act ${seconds} s\n`);
  process.stdout.write(`PASS     closed · ${under ? 1 : receiptPlaces(root, store).length} places · ${ms} ms\n`);
  return 0;
}

export async function pass(root: string, entry: string, under: string | undefined, check: boolean): Promise<number> {
  if (check) {
    // Verification reads existing evidence; it grants no admission authority.
    return withoutEffects(() => emptyLedger(storeOf(root)) ? checked(root, entry, under) : underTheLock(storeOf(root), 'check', () => checked(root, entry, under)));
  }
  if (!under && emptyLedger(storeOf(root))) {
    sayStranger(root);
    return 0;
  }
  const started = Date.now();
  const run = async (): Promise<number> => {
    const swept = await sweep(root, entry, under, check, []);
    for (const coordinate of check ? swept.written : []) process.stdout.write(`DIFFERS  ${coordinate}\n`);
    // Byte seals describe the completed render pass, not its intermediate outputs.
    if (!swept.written.length) await closeReceipts(root, storeOf(root));
    const closed = meets(root, storeOf(root), under ?? '') && !swept.written.length;
    const fold = foldPlace(root, entry, under, false, { standing: swept.standingAt.get(under ?? '') ?? standingOf(root, under), observed: swept.settled ? [] : swept.observed.length ? swept.observed : observedClaims(root, storeOf(root), { wait: false }), free: !swept.settled });
    for (const line of releasePolicyLines(fold.release)) process.stdout.write(`${line}\n`);
    if (closed) {
      instrumentKeep(storeOf(root), instrumentOf(storeOf(root), entry, standingOf(root).standing, root, ownLock()));
      process.stdout.write(`PASS     closed · ${swept.places} places · ${Date.now() - started} ms\n`);
      return 0;
    }
    process.stdout.write(`PASS     ${swept.same + swept.written.length} renders · ${swept.same} same${swept.written.length ? ` · ${swept.written.length} ${check ? 'differ' : 'still written after three rounds'}` : ''} · ${swept.places} places · ${Date.now() - started} ms\n`);
    process.stdout.write(render(fold, [{ name: 'programs', at: 1 }]));
    return swept.written.length ? 1 : 0;
  };
  return underTheLock(storeOf(root), 'pass', run);
}

export type Journal = Map<string, { readonly held: Uint8Array | undefined; readonly made: string | undefined }>;

export function landSaid(store: string, folder: string | undefined, lines: readonly string[]): void {
  if (folder === undefined || !lines.length) return;
  const bare = (line: string): string => ((got) => (got.kind === 'fact' ? canonical(Object.fromEntries(Object.entries(got.value.fields).filter(([name]) => !ENVELOPE.has(name) && name !== 'by'))) : line))(parse(line));
  const held = new Set(ledgerLines(store, folder).filter((line) => /(?:^|\s)scope=re(?:ndered|solved)\//.test(line)).map(bare));
  const fresh = [...new Set(lines.filter((line) => !held.has(bare(line))).map((line) => ((got) => (got.kind === 'fact' ? canonical({ ...got.value.fields, by: folder }) : line))(parse(line))))];
  if (fresh.length) land(store, folder, fresh);
}

async function sweep(root: string, entry: string, under: string | undefined, check: boolean, told: readonly string[], journal?: Journal, given?: readonly string[], keep?: ReadonlySet<string>, reach?: readonly string[]): Promise<{
  readonly same: number;
  readonly written: readonly string[];
  readonly places: number;
  readonly observed: readonly string[];
  readonly standingAt: ReadonlyMap<string, ReturnType<typeof standingOf>>;
  readonly folds: ReadonlyMap<string, PlaceFold>;
  readonly said: readonly string[];
  readonly settled: boolean;
}> {
  const store = storeOf(root);
  const digestAt = Date.now();
  const met = told.length === 0 && reach === undefined && meets(root, store, under ?? '');
  const sameInstrument = instrumentKept(store) === instrumentOf(store, entry, standingOf(root).standing, root, ownLock());
  const missingView = (): boolean => {
    if (!under || !worldAt(root, under.replace(/\/$/, ''))) return false;
    const held = standingOf(root, under);
    const views = viewsOf(held.standing);
    return wordsOf(held.standing, 'views/world').some((name) => {
      const view = views.get(name);
      return view?.shape !== undefined && view.shape !== '' && observeText(join(root, under, view.shape)) === undefined;
    });
  };
  const settled = met && sameInstrument && !missingView();
    if (settled) {
    const ms = Date.now() - digestAt;
    const read = receiptsSeen();
    const lock = algorithmCost();
    const hash = Math.max(0, ms - lock);
    if (lock > 0) {
      noteIdle();
      process.stderr.write(`RED      fold/idle · ${idleCount()} · lock ${lock} ms · hash ${hash} ms · a fold over a closed region\n`);
    }
    if (under === undefined) process.stderr.write(`RECEIPTS ${read.count} read · 0 opened · ${ms} ms\n`);
    else process.stderr.write(`CLOSED   ${under} · lock ${lock} ms · hash ${hash} ms\n`);
    const seconds = actSeconds();
    process.stderr.write(`COST     act ${seconds} s\n`);
    return { same: 0, written: [], places: under === undefined ? read.count : 1, observed: [], standingAt: new Map(), folds: new Map(), said: [], settled: true };
  }
  const lock = standingOf(root, undefined, told);
  // A place asks for its own mounts; the instrument catalog is not a consumer dependency.
  layReleases(store, root, lock.standing, store);
  const descent = reach ?? (under ? [under.replace(/\/$/, '')] : undefined);
  const limited = descent !== undefined;
  const observed = given ?? observedClaims(root, store, { wait: true, ...(descent !== undefined ? { reach: descent } : {}) });
  landLaid(store, root, lock.standing, writerFor(lock.standing, 'fold'));
  const shaped = (standing: readonly string[]): readonly View[] => [...viewsOf(standing).values()].flatMap((view) => ('regions' in view && view.shape ? [view] : []));
  const views = shaped(lock.standing);
  const tree = viewsOf(lock.lock);
  const worldList = wordsOf(lock.standing, 'views/world');
  const worldPlaces = new Set(worldsIn(root).map((name) => `${name}/`));
  const resolved = (view: View): readonly string[] => {
    const named = placesOf(lock.standing, view);
    if (!worldList.includes(view.name)) return named;
    const picked = named.filter((place) => worldPlaces.has(place));
    return picked.length ? picked : [...worldPlaces];
  };
  const placeless = views.filter((view) => !worldList.includes(view.name) && !placesOf(lock.standing, view).length);
  const holding = entriesIn(root).filter((entry) => entry.dir && placeless.some((view) => observeText(join(root, entry.name, view.shape)) !== undefined)).map((entry) => `${entry.name}/`);
  const descended = (place: string): boolean => !limited || descent.some((one) => one === '' || place === `${one}/` || place.startsWith(`${one}/`));
  const reached = limited ? descent.filter((one) => one !== '').map((one) => (one.endsWith('/') ? one : `${one}/`)) : [];
  const places = [...new Set([...views.flatMap(resolved), ...holding, ...reached])]
    .filter((place) => place !== '' && (!under || place.startsWith(under)) && descended(place)).sort();
  const standingAt = new Map([...places, ''].map((place) => [place, place ? standingOf(root, place, told) : lock] as const));
  const writes = (place: string): readonly View[] => {
    const { standing } = standingAt.get(place) ?? lock;
    const mine = shaped(standing);
    const own = worldAt(root, place.slice(0, -1)) ? ownLockOf(root, place.slice(0, -1)) : [];
    const namedOf = (view: View): readonly string[] => placesOf(standing, view);
    return mine.filter((view) => namedOf(view).includes(place) || (own.length > 0 && defaulted(standing, view, own, tree))
      || (!worldList.includes(view.name) && !namedOf(view).length && observeText(join(root, place, view.shape)) !== undefined && !mine.some((other) => other.shape === view.shape && namedOf(other).includes(place))));
  };
  let same = 0;
  let written: string[] = [];
  const read = new Set(ownLock().filter((line) => fieldOf(line, 'scope').startsWith('region/') && fieldOf(line, 'measure') === 'lines').flatMap((line) => fieldOf(line, 'value').split('|')));
  const free = (place: string): boolean => limited ? descended(place) : !sameInstrument || !meets(root, store, place);
  const folds = new Map<string, PlaceFold>();
  const answered = new Map<string, readonly string[]>();
  const paint = (place: string, drawn: readonly Drawn[], moved: { at: boolean }): void => {
    for (const view of drawn) {
      if (view.missing.length) {
        throw new Error(`REFUSE·view at ${place || '.'} · asks regions nothing renders: ${view.missing.join(' ')}`);
      }
      if (!check && view.said.length) answered.set(`${place}${view.shape}`, view.said);
      const coordinate = join(root, place, view.shape);
      const leaf = ['s', 'v', 'g'].join('');
      if (view.shape.endsWith(`.${leaf}`) && !view.text.includes(`<${leaf}`)) {
        if (!check && observeText(coordinate) !== undefined) {
          rmSync(coordinate, { force: true });
          written.push(`${place}${view.shape}`);
        }
        continue;
      }
      if (observeText(coordinate) === view.text) same += 1;
      else if (check) written.push(`${place}${view.shape}`);
      else {
        moved.at ||= observeText(coordinate) === undefined || read.has(view.shape);
        const held = journal !== undefined && !journal.has(coordinate) ? observeFile(coordinate) : undefined;
        const made = mkdirSync(dirname(coordinate), { recursive: true });
        if (journal !== undefined && !journal.has(coordinate)) journal.set(coordinate, { held, made });
        replaceWhole(coordinate, view.text);
        written.push(`${place}${view.shape}`);
      }
    }
  };
  for (let round = 1; round <= 3; round += 1) {
    written = [];
    same = 0;
    const moved = { at: false };
    const asked = [...places, ...(under || (limited && descent.length > 0 && !descent.includes('')) ? [] : [''])];
    const open = asked.filter((place) => free(place));
    for (const place of asked) if (!open.includes(place)) same += writes(place).length;
    if (!under && round === 1) {
      if (!receiptsSeen().count) meets(root, store, '');
      const read = receiptsSeen();
      process.stderr.write(`RECEIPTS ${read.count} read · ${open.length} opened · ${read.ms} ms\n`);
    }
    if (open.length) process.stderr.write(`OPEN     ${open.map((place) => place || '.').join(' ')}\n`);
    const aside = open.filter((place) => place !== '' && !keep?.has(place) && !meets(root, store, place));
    const drawn = aside.length > 1 ? await drawParallel(aside.map((place) => ({ root, entry, place, told, observed, views: writes(place) }))) : new Map<string, readonly Drawn[]>();
    for (const place of open) {
      if (!check && place === '') await holdRoot(store, 'join');
      if (!check && !holds(store, place)) {
        process.stderr.write(`OUTSIDE  ${place} · not settled, and no region this act holds: the next pass renders it\n`);
        continue;
      }
      const ready = drawn.get(place);
      if (ready !== undefined) {
        paint(place, ready, moved);
        continue;
      }
      const standing = standingAt.get(place) ?? lock;
      const fold = foldPlace(root, entry, place || undefined, false, { standing, observed, free: true });
      if (keep?.has(place)) folds.set(place, fold);
      paint(place, writes(place).map((view) => {
        const missing = unrendered(fold, view);
        return { shape: view.shape, missing, text: missing.length ? '' : viewOf(fold, view), said: missing.length ? [] : renderedOf(fold, view) };
      }), moved);
    }
    if (check || !written.length) break;
    for (const coordinate of written) process.stdout.write(`RENDERED ${coordinate} · round ${round}\n`);
    if (!moved.at) {
      same += written.length;
      written = [];
      break;
    }
  }
  const said = [...answered.values()].flat();
  if (!check && journal === undefined) landSaid(store, writerFor(lock.standing, 'fold'), [...resolvedOf(store, root, lock.standing, store), ...said]);
  return { same, written, places: places.length + (under ? 0 : 1), observed, standingAt, folds, said: journal === undefined ? [] : said, settled: false };
}

type Drawn = { readonly shape: string; readonly missing: readonly string[]; readonly text: string; readonly said: readonly string[] };

function drawParallel(jobs: readonly { readonly root: string; readonly entry: string; readonly place: string; readonly told: readonly string[]; readonly observed: readonly string[]; readonly views: readonly View[] }[]): Promise<Map<string, readonly Drawn[]>> {
  const out = new Map<string, readonly Drawn[]>();
  if (jobs.length < 2) return Promise.resolve(out);
  return new Promise((resolve, reject) => {
    const workers: Worker[] = [];
    let left = jobs.length;
    let failed = false;
    const refuse = (error: Error): void => {
      if (failed) return;
      failed = true;
      reject(error);
      for (const worker of workers) void worker.terminate();
    };
    try {
      for (const job of jobs) {
        const worker = new Worker(processOf('fold-worker', 'fold'), { execArgv: process.execArgv, workerData: job });
        workers.push(worker);
        worker.on('message', (msg: { readonly place: string; readonly texts: readonly Drawn[] }) => out.set(msg.place, msg.texts));
        worker.on('error', refuse);
        worker.on('exit', (code) => {
          if (failed) return;
          if (code !== 0 || !out.has(job.place)) {
            refuse(new Error(`REFUSE·worker ${job.place} · exit ${code} · no completed render`));
            return;
          }
          left -= 1;
          if (left === 0) resolve(out);
        });
      }
    } catch (error) {
      refuse(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
