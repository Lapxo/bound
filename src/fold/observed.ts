import {readOnly} from '../host/read-only.ts';
import { basename, dirname, existsSync, mkdirSync, resolve, rmSync, spawn, statSync, writeFileSync } from '../host/io.ts';
import { bundleOf, processOf } from '../observe/runner.ts';
import { canonical, parse, PROTOCOL } from '@lapxo/topos/wire';
import { bytesDigest, memoized } from './digests.ts';
import { land, landMemo, landShard, memoAt, shardLines, storeAt } from '../land/ledger.ts';
import { fieldOf, isWire } from './claims.ts';
import { rolesOf } from './roles.ts';
import { keyFor, lockStanding } from './keys.ts';
import { spoken } from './places.ts';
import { capsuleAt, childFlags } from '../host/capsule.ts';
import { wordOf } from './wire.ts';
import { observeFile, observeText } from '../observe/files.ts';
import { identityOf, vectorsOf } from '../observe/identity.ts';
import { capsuleReadersOf, handedAt, lookOf, offersOf } from './readers.ts';
import type { Offer, ReaderClaim } from './readers.ts';
import { runReader, runs } from '../observe/run.ts';
import { LEVEL, OBSERVED, keepObservation, keyOf, legacyOf, observation, observed as observedAt, opened, pointer, readerOf, regionIn, setAside, sha, trimmed } from './shards.ts';
import { saidDigest } from './kept.ts';
import { carriedIn, carriedFrom } from './resolved.ts';

export const cased = (question: string): boolean => /^(?:vector|sample)\//.test(question);

type Seen = {
  readonly scope: string;
  readonly measure: string;
  readonly role: string;
  readonly bound: { readonly kind: string; readonly values?: readonly string[]; readonly lo?: number; readonly hi?: number };
};

export function isReaderLock(line: string): boolean {
  const got = parse(line);
  return got.kind === 'fact' && got.value.fields['measure'] === 'reader';
}

export function readerModules(store: string): readonly string[] {
  return readersOf(store).map((reader) => reader.module);
}

/** The readers of a tree: those a place's own lock names for what it holds, and those the lock names that no place's lock rules. */
function readersOf(store: string): readonly ReaderClaim[] {
  const standing = lockStanding(store);
  const family = `${wordOf(standing, 'families', 'reader')}/`;
  const own = spoken(dirname(store)).map((one) => one.line).filter((line) => fieldOf(line, 'scope').startsWith(family));
  const ruled = new Set(own.map((line) => fieldOf(line, 'scope')));
  return [...own, ...standing.filter((line) => !ruled.has(fieldOf(line, 'scope')))]
    .map((line) => parse(line))
    .flatMap((got) => (got.kind === 'fact' ? [got.value.fields] : []))
    .filter((f) => (f['scope'] ?? '').startsWith(family) && f['measure'] === 'reader' && f['value'] !== 'withdraw')
    .flatMap((f) => {
      const kind = f['kind'] || ((f['shape'] ?? '').split('|').includes(wordOf(standing, 'shapes', 'run')) ? 'process' : 'js');
      return runs(kind) ? [{
        id: (f['scope'] ?? '').slice(family.length),
        shape: (f['shape'] ?? '').split('|').filter(Boolean),
        where: (f['needs'] ?? '').split('|').filter(Boolean),
        module: f['value'] ?? '',
        kind,
      }] : [];
    })
    .filter((reader) => reader.id !== '' && reader.shape.length > 0 && reader.where.length > 0 && reader.module !== '');
}

function lineOf(seen: Seen, digest: string, by: string, reader: string): string {
  const interval = seen.bound.kind === 'interval';
  return canonical({
    scope: seen.scope,
    role: seen.role,
    form: interval ? 'interval' : 'alphabet',
    measure: seen.measure,
    value: interval ? `${seen.bound.lo ?? 0}..${seen.bound.hi ?? 0}` : (seen.bound.values ?? []).join('|'),
    by: `${reader}:${by}`,
    at: `place:${digest}`,
  });
}


type Placed = { readonly question: string; readonly measure: string; readonly value: string; readonly place: string; readonly by: string; readonly at: string };
const placed = new WeakMap<readonly string[], readonly Placed[]>();

export function placedReadings(observed: readonly string[]): readonly Placed[] {
  const already = placed.get(observed);
  if (already !== undefined) return already;
  const taken = takeReadings(observed);
  placed.set(observed, taken);
  return taken;
}

export function casesHeld(observed: readonly string[]): number {
  return new Set(placedReadings(observed).filter((r) => r.measure === 'pass' && r.value === 'pass' && cased(r.question)).map((r) => r.question)).size;
}

function takeReadings(observed: readonly string[]): readonly Placed[] {
  const placesOf = new Map<string, Set<string>>();
  for (const line of observed) {
    if (!OBSERVED.test(line)) continue;
    const key = `${readerOf(line) ?? ''} ${fieldOf(line, 'at')}`;
    placesOf.set(key, (placesOf.get(key) ?? new Set<string>()).add(fieldOf(line, 'scope')));
  }
  return observed.flatMap((line) => {
    if (OBSERVED.test(line)) return [];
    const reading = { question: fieldOf(line, 'scope'), measure: fieldOf(line, 'measure'), value: fieldOf(line, 'value'), by: fieldOf(line, 'by'), at: fieldOf(line, 'at') };
    return [...(placesOf.get(`${readerOf(line) ?? ''} ${fieldOf(line, 'at')}`) ?? [])].map((place) => ({ ...reading, place }));
  });
}

const behind: { module: string; places: number }[] = [];
export const readersBehind = (): readonly { readonly module: string; readonly places: number }[] => behind;
const refused: string[] = [];
export const readerRefusals = (): readonly string[] => refused;

const alive = (pid: number): boolean => { try { return process.kill(pid, 0); } catch { return false; } };
function travelled(store: string, speaker: string): void {
  for (const file of carriedIn(store)) {
    const text = observeText(file);
    if (text === undefined) continue;
    const marker = storeAt(store, 'cas', 'travelled', sha(text));
    if (existsSync(marker)) continue;
    const whole = new Map<string, string>();
    for (const line of text.split('\n').filter(isWire)) {
      const bare = line.replace(/ sig="[^"]*"/, '');
      if (!whole.has(bare) || / sig=/.test(line)) whole.set(bare, line);
    }
    const byHead = new Map<string, string[]>();
    for (const line of whole.values()) {
      const head = (fieldOf(line, 'by').split(':')[0] ?? '').trim();
      if (head) byHead.set(head, [...(byHead.get(head) ?? []), line]);
    }
    for (const [head, lines] of byHead) {
      if (head !== speaker) {
        land(store, head, lines);
        continue;
      }
      const at = new Map<string, string[]>();
      for (const line of lines.filter((one) => !OBSERVED.test(one))) at.set(`${readerOf(line) ?? ''} ${fieldOf(line, 'at')}`, [...(at.get(`${readerOf(line) ?? ''} ${fieldOf(line, 'at')}`) ?? []), line]);
      const groups = new Map<string, string[]>();
      for (const line of lines.filter((one) => OBSERVED.test(one))) {
        const group = `${readerOf(line) ?? ''}\u0000`;
        groups.set(group, [...(groups.get(group) ?? []), line]);
      }
      for (const [group, observed] of groups) {
        const [by = '', region = ''] = group.split('\u0000');
        landShard(store, speaker, region, observed);
        const pairs = observed.map((line) => `${fieldOf(line, 'scope')} ${fieldOf(line, 'at')}`);
        keepObservation(store, keyOf(by, region, pairs, 'receipt'), [...new Set(observed.map((line) => fieldOf(line, 'at')))].flatMap((one) => at.get(`${by} ${one}`) ?? []));
      }
    }
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, `${basename(file)}\n`);
  }
}

function carried(store: string): readonly string[] {
  const speaker = (() => { try { return keyFor(store, 'read'); } catch { return undefined; } })();
  travelled(store, speaker ?? '');
  return carriedIn(store).flatMap((file) => (observeText(file) ?? '').split('\n'))
    .filter((line) => isWire(line) && speaker !== undefined && fieldOf(line, 'by').split(':')[0] === speaker);
}

const lineagesOf = (store: string, speaker: string, readers: readonly ReaderClaim[], regions: readonly string[]): ReadonlySet<string> =>
  new Set(readers.flatMap((reader) => shardLines(store, speaker, regionIn(regions, reader.module))
    .filter((line) => fieldOf(line, 'scope') === `reader/${reader.module}` && /(?:^|\s)measure=(?:identity|extension)\s/.test(line)).map((line) => fieldOf(line, 'value'))));

export function readerLines(store: string): readonly string[] {
  const readers = readersOf(store);
  const regions = [...new Set(readers.flatMap((reader) => reader.where.map(trimmed)))];
  const speaker = keyFor(store, 'read');
  return [...new Set(readers.map((reader) => regionIn(regions, reader.module)))].flatMap((region) => shardLines(store, speaker, region).filter((line) => LEVEL.test(line)));
}

/**
 * A reader never blocks a fold that did not ask to wait: what it read before is served at once, and a reader whose
 * identity is new, or whose places moved, is grey by name and runs behind the fold. A fold that judges waits. A fold
 * that reaches only some regions observes only those, and a place with no reader reads what it carries.
 */
export const carriesOnly = (root: string, store: string): boolean => ((lines) => !lines.length && !capsuleReadersOf(root, store, lockStanding(store), lines).length)(readersOf(store));

/** A reader whose `needs` meet the reach runs, wherever its module lives. The module path is not the region it reads. */
export function readerReaches(reach: readonly string[] | undefined, where: readonly string[]): boolean {
  if (reach === undefined) return true;
  const reached = (region: string): boolean => reach.map(trimmed).some((one) => one === '' || region === one || region.startsWith(`${one}/`) || one.startsWith(`${region}/`));
  return where.some((one) => reached(trimmed(one)));
}

export function observedClaims(root: string, store: string, options: { readonly wait?: boolean; readonly only?: string; readonly reach?: readonly string[]; readonly answered?: Map<string, string> } = {}): readonly string[] {
  refused.length = 0;
  if (readOnly()) {
    const carried = (observeText(resolve(root, 'receipts.bound')) ?? '').split('\n').filter(isWire);
    const evidence = carriedFrom(store, carried);
    if (evidence === undefined) throw Error('REFUSE·preview native receipt bytes unavailable; fold the declared inputs first');
    return evidence;
  }
  const wait = options.wait ?? true;
  const standing = lockStanding(store);
  const lines = readersOf(store);
  const readers = [...lines, ...capsuleReadersOf(root, store, standing, lines)];
  if (!readers.length) return carried(store);
  const speaker = keyFor(store, 'read');
  const regions = [...new Set(readers.flatMap((reader) => reader.where.map(trimmed)))];
  const whole = options.only === undefined && options.reach === undefined;
  const legacy = whole ? legacyOf(store, speaker, regions) : undefined;
  const reached = (region: string): boolean => readerReaches(options.reach, [region]);
  const shards = new Map<string, ReturnType<typeof opened>>();
  const lineages = lineagesOf(store, speaker, readers, regions);
  const open = (region: string): ReturnType<typeof opened> => shards.get(region) ?? shards.set(region, opened(store, speaker, region, lineages)).get(region)!;
  const read_ = new Map<string, ReadonlyMap<string, readonly string[]> | undefined>();
  const byAt = (key: string | undefined): ReadonlyMap<string, readonly string[]> | undefined => {
    if (key === undefined) return undefined;
    if (!read_.has(key)) {
      const lines = observation(store, key);
      const at = new Map<string, string[]>();
      for (const line of lines ?? []) at.set(fieldOf(line, 'at'), [...(at.get(fieldOf(line, 'at')) ?? []), line]);
      read_.set(key, lines === undefined ? undefined : at);
    }
    return read_.get(key);
  };
  const lastOf = (shard: ReturnType<typeof opened>, one: string, places: readonly string[]): ReadonlyMap<string, readonly string[]> | undefined => {
    if (shard.keys.has(one)) return byAt(shard.keys.get(one));
    const known = places.flatMap((place) => shard.places.get(`${one} ${place}`) ?? []);
    if (!known.length) return undefined;
    const pairs = known.map((held) => `${fieldOf(held.line, 'scope')} ${held.at}`);
    if (legacy === undefined) return byAt(keyOf(one, shard.region, pairs, 'receipt'));
    const key = keyOf(one, shard.region, pairs);
    keepObservation(store, key, [...new Set(known.map((held) => held.at))].flatMap((at) => legacy.get(`${one} ${at}`) ?? []));
    landShard(store, speaker, shard.region, [pointer(speaker, one, shard.region, key, pairs)]);
    shard.keys.set(one, key);
    return byAt(key);
  };
  const servedAt = (shard: ReturnType<typeof opened>, one: string, place: string, held: ReadonlyMap<string, readonly string[]> | undefined): readonly string[] => {
    const known = shard.places.get(`${one} ${place}`);
    return known === undefined ? [] : [known.line, ...(held?.get(known.at) ?? [])];
  };
  const out: string[] = [];
  const answered = options.answered;
  const digestsAt = (key: string): readonly (readonly [string, string])[] => Object.entries(JSON.parse(memoized(store, `said ${key}`, () => {
    const at = new Map<string, string[]>();
    for (const line of observation(store, key) ?? []) at.set(fieldOf(line, 'at'), [...(at.get(fieldOf(line, 'at')) ?? []), line]);
    return JSON.stringify(Object.fromEntries([...at].map(([one, lines]) => [one, saidDigest(store, lines)])));
  })) as Record<string, string>);
  const heard = (lines: readonly string[]): void => {
    const at = new Map<string, string[]>();
    for (const line of lines) if (!OBSERVED.test(line)) at.set(`${readerOf(line) ?? ''} ${fieldOf(line, 'at')}`, [...(at.get(`${readerOf(line) ?? ''} ${fieldOf(line, 'at')}`) ?? []), line]);
    for (const line of lines) if (OBSERVED.test(line)) answered?.set(`${readerOf(line) ?? ''} ${fieldOf(line, 'at')}`, saidDigest(store, at.get(`${readerOf(line) ?? ''} ${fieldOf(line, 'at')}`) ?? []));
  };
  const began = Date.now();
  let ran = 0;
  let read = 0;
  let whole_ = 0;
  const roleOf = rolesOf(store);
  const look = lookOf(root, roleOf);
  behind.length = 0;
  const spent: string[] = [];
  for (const reader of readers) {
    if (options.only !== undefined && reader.module !== options.only) continue;
    if (!readerReaches(options.reach, reader.where)) continue;
    const started = Date.now();
    const mark = out.length;
    if (!observeOne(reader, started) && answered !== undefined) heard(out.slice(mark));
  }
  function observeOne(reader: ReaderClaim, started: number): boolean {
    const module = resolve(root, reader.module);
    const asked = reader.capsule === undefined ? undefined : capsuleAt(reader.capsule.digest, reader.capsule.entry);
    const source = reader.capsule === undefined ? observeFile(module) : asked === undefined ? undefined : new Uint8Array();
    const bundle = source && reader.capsule === undefined ? bundleOf(module) ?? bytesDigest(store, source) : 'none';
    const offered = offersOf(root, store, reader, roleOf, look, (where) => reached(trimmed(where)));
    const vectors = reader.capsule === undefined ? observeText(resolve(root, vectorsOf(reader.module, standing))) : undefined;
    const kept = whole && legacy === undefined && answered === undefined && source ? sha([
      speaker, reader.module, reader.kind, reader.shape.join('|'), reader.where.join('|'), bundle, vectors === undefined ? 'no vectors' : sha(vectors),
      reader.capsule === undefined ? '' : `${reader.capsule.digest} ${reader.capsule.region} ${reader.capsule.reads.join('|')} ${[...reader.capsule.globs].map(([place, globs]) => `${place}${globs.join('|')}`).join(' ')}`,
      ...offered.map((offer) => `${offer.place} ${offer.digest?.() ?? bytesDigest(store, offer.bytes())}`),
    ].join('\n')) : undefined;
    const stored = kept === undefined ? undefined : observeText(memoAt(store, `observed/${kept}`));
    if (stored !== undefined) {
      out.push(...stored.split('\n').filter(isWire));
      read += offered.length;
      whole_ += 1;
      return false;
    }
    const mark = out.length;
    const home = regionIn(regions, reader.module);
    const own = shardLines(store, speaker, home).filter((line) => fieldOf(line, 'scope') === `reader/${reader.module}`);
    const lineage = own.filter((line) => fieldOf(line, 'measure') === 'identity').map((line) => fieldOf(line, 'value'));
    const sum = source && reader.capsule === undefined ? bytesDigest(store, new TextEncoder().encode(`${reader.module} ${bundle}`)).replace(/^sha256:/, '').slice(0, 12) : 'none';
    const measured = reader.capsule !== undefined ? { by: source ? sha(`${reader.capsule.digest}\n${reader.capsule.region}`).slice(0, 12) : 'none', lines: [] as readonly string[] }
      : source ? identityOf({ store, root, speaker, module: reader.module, kind: reader.kind, code: sum, lineage, kept: own.filter((line) => /(?:^|\s)measure=(?:extension|emits)\s/.test(line)) })
      : { by: 'none', lines: [] };
    const by = measured.by;
    const level: string[] = [...measured.lines];
    const identified = Date.now();
    const lines = [...lineage, by];
    const before = [...lineage].reverse().find((one) => one !== by);
    const regionsOf = new Map<string, Offer[]>();
    for (const offer of offered) {
      const region = regionIn(regions, offer.place);
      if (reached(region)) regionsOf.set(region, [...(regionsOf.get(region) ?? []), offer]);
    }
    const planned = [...regionsOf].map(([region, offers]) => {
      const shard = open(region);
      const places = offers.map((offer) => offer.place);
      const pairs: string[] = [];
      const kept: string[] = [];
      const moved: { place: string; seen: string; digest: string; bytes: Uint8Array }[] = [];
      const all: { place: string; seen: string; digest: string; bytes: () => Uint8Array }[] = [];
      for (const offer of offers) {
        const known = shard.places.get(`${by} ${offer.place}`);
        if (known && fieldOf(known.line, 'value') === offer.seen) {
          pairs.push(`${offer.place} ${known.at}`);
          kept.push(known.line);
          all.push({ ...offer, digest: known.at.slice('place:'.length) });
          read += 1;
          continue;
        }
        const bytes = offer.digest ? undefined : offer.bytes();
        const digest = offer.digest?.() ?? bytesDigest(store, bytes!);
        pairs.push(`${offer.place} place:${digest}`);
        kept.push(canonical({ scope: offer.place, role: 'writes', form: 'alphabet', measure: 'observed', value: offer.seen, by: `${speaker}:${by}`, at: `place:${digest}` }));
        all.push({ ...offer, digest, bytes: () => bytes ?? offer.bytes() });
        if (known?.at === `place:${digest}`) read += 1;
        else moved.push({ place: offer.place, seen: offer.seen, digest, bytes: bytes ?? offer.bytes() });
      }
      return { region, shard, places, pairs, kept, moved, all, key: keyOf(by, region, pairs) };
    });
    if (answered !== undefined && planned.every((plan) => !plan.moved.length && observedAt(store, plan.key))) {
      for (const plan of planned) {
        for (const [at, digest] of digestsAt(plan.key)) answered.set(`${by} ${at}`, digest);
        if (plan.shard.keys.get(by) !== plan.key || plan.kept.some((line) => plan.shard.places.get(`${by} ${fieldOf(line, 'scope')}`)?.line !== line)) {
          landShard(store, speaker, plan.region, [...plan.kept, pointer(speaker, by, plan.region, plan.key, plan.pairs)]);
        }
        out.push(...plan.kept);
      }
      if (level.length) landShard(store, speaker, home, level);
      return true;
    }
    const plans = planned.map(({ region, shard, places, pairs, kept, moved, all, key }) => {
      const prior = lastOf(shard, by, places);
      if (before !== undefined) lastOf(shard, before, places);
      const ats = [...new Set(pairs.map((pair) => pair.slice(pair.indexOf(' ') + 1)))];
      const found = byAt(key);
      const said = found !== undefined ? ats.flatMap((at) => found.get(at) ?? [])
        : moved.length || prior === undefined ? undefined : ats.flatMap((at) => prior.get(at) ?? []);
      const due = said === undefined && !moved.length ? all.map((one) => ({ place: one.place, seen: one.seen, digest: one.digest, bytes: one.bytes() })) : moved;
      return { region, shard, places, pairs, kept, due, key, said, prior, found: found !== undefined };
    });
    const due = plans.flatMap((plan) => (plan.said === undefined ? plan.due.map((one) => ({ ...one, region: plan.region })) : []));
    const heldOf = (place: string, region: string): readonly (readonly [string, string])[] => {
      for (const one of [...lines].reverse()) {
        const shard = open(region);
        const mine = servedAt(shard, one, place, lastOf(shard, one, [place])).slice(1);
        if (mine.length) return mine.map((line) => [fieldOf(line, 'scope'), fieldOf(line, 'value')] as const);
      }
      return [];
    };
    if (due.length && !source) {
      refused.push(`REFUSE·reader ${reader.module} unavailable · ${due.length} readings remain due`);
      return false;
    }
    if (due.length && !wait) {
      for (const plan of plans) {
        if (plan.said !== undefined) {
          out.push(...plan.kept, ...plan.said);
          continue;
        }
        for (const place of plan.places) {
          const mine = servedAt(plan.shard, by, place, plan.prior);
          out.push(...(mine.length || before === undefined ? mine : servedAt(plan.shard, before, place, lastOf(plan.shard, before, plan.places))));
        }
      }
      const marker = storeAt(store, 'pending', by);
      const pid = Number((observeText(marker) ?? '').split('\n')[1]);
      const running = existsSync(marker) && Date.now() - statSync(marker).mtimeMs < 30 * 60 * 1000 && Number.isInteger(pid) && pid > 0 && alive(pid);
      if (!running) {
        mkdirSync(dirname(marker), { recursive: true });
        const child = spawn(process.execPath, [...childFlags(), processOf('observe'), root, reader.module], { cwd: root, detached: true, stdio: 'ignore' });
        child.unref();
        writeFileSync(marker, `${reader.module}\n${child.pid ?? ''}\n`);
      }
      behind.push({ module: reader.module, places: due.length });
      process.stderr.write(`GREY     reading: ${reader.module} · ${due.length} places · runs behind${running ? ', already running' : ''}\n`);
      if (level.length) landShard(store, speaker, home, level);
      if (Date.now() - started > 250) spent.push(`${reader.module.split('/').pop()} behind ${Date.now() - started}`);
      return false;
    }
    if (due.length) {
      const at = Date.now();
      let rows: ReturnType<typeof runReader>;
      try {
        rows = reader.capsule !== undefined && asked !== undefined
          ? asked.ask(due.map((d) => ({
            protocol: PROTOCOL, verb: 'read' as const, rootScope: d.place, region: reader.capsule!.region, held: heldOf(d.place, d.region),
            files: (reader.capsule!.reads.some((read) => read.includes('@')) ? handedAt(root, reader, roleOf, look, d.place) : [d.place]).map((coordinate) => ({ place: coordinate, text: observeText(resolve(root, coordinate)) ?? '' })),
          }))).map((answer) => {
            if (answer?.kind !== 'fact') throw new Error(`REFUSE·reader ${reader.module} · ${answer?.why ?? 'no capsule answer'}`);
            return (answer.claims ?? []) as ReturnType<typeof runReader>[number];
          })
          : runReader(module, root, due.map((d) => ({ place: d.place, ...(reader.kind === 'js' ? { text: new TextDecoder().decode(d.bytes) } : {}), held: heldOf(d.place, d.region) })));
      } catch (error) {
        const why = `REFUSE·reader ${reader.module} · ${error instanceof Error ? error.message : String(error)}`;
        refused.push(why);
        process.stderr.write(`${why}\n`);
        return false;
      }
      if (rows.every((mine) => !mine.length)) {
        const why = `REFUSE·reader ${reader.module} · answered none of ${due.length} places · nothing landed, they stay due`;
        refused.push(why);
        process.stderr.write(`${why}\n`);
        return false;
      }
      ran += due.length;
      process.stderr.write(`READER   ${reader.module} · ${due.length} run · ${Date.now() - at} ms\n`);
      const fresh = new Map<string, string[]>();
      due.forEach((d, i) => fresh.set(d.place, (rows[i] ?? []).map((row) => lineOf(row, d.digest, by, speaker))));
      for (const plan of plans.filter((one) => one.said === undefined)) {
        const mine = new Set(plan.due.map((d) => d.place));
        const stay = [...new Set(plan.pairs.filter((pair) => !mine.has(pair.slice(0, pair.indexOf(' ')))).map((pair) => pair.slice(pair.indexOf(' ') + 1)))];
        const said = [...stay.flatMap((one) => plan.prior?.get(one) ?? []), ...[...mine].flatMap((place) => fresh.get(place) ?? [])];
        keepObservation(store, plan.key, said);
        landShard(store, speaker, plan.region, [...plan.kept, pointer(speaker, by, plan.region, plan.key, plan.pairs)]);
        out.push(...plan.kept, ...said);
      }
      const spent = Date.now() - at;
      const over = bytesDigest(store, new TextEncoder().encode(due.map((d) => d.digest).sort().join('\n'))).replace(/^sha256:/, '');
      level.push(canonical({ scope: `cost/reader/${reader.module}`, role: 'writes', form: 'interval', measure: 'ms', value: `${spent}..${spent}`, by: `${speaker}:${by}`, at: `place:${over}` }));
      if (lineage.at(-1) !== by) level.push(canonical({ scope: `reader/${reader.module}`, role: 'writes', form: 'alphabet', measure: 'identity', value: by, by: `${speaker}:${by}`, at: `place:${by}` }));
      rmSync(storeAt(store, 'pending', by), { force: true });
    }
    for (const plan of plans.filter((one) => one.said !== undefined)) {
      if (!plan.found) keepObservation(store, plan.key, plan.said!);
      if (plan.shard.keys.get(by) !== plan.key || plan.kept.some((line) => plan.shard.places.get(`${by} ${fieldOf(line, 'scope')}`)?.line !== line)) {
        landShard(store, speaker, plan.region, [...plan.kept, pointer(speaker, by, plan.region, plan.key, plan.pairs)]);
      }
      out.push(...plan.kept, ...plan.said!);
    }
    if (level.length) landShard(store, speaker, home, level);
    if (Date.now() - started > 250) spent.push(`${reader.module.split('/').pop()} ${identified - started}+${Date.now() - identified}`);
    if (kept !== undefined) landMemo(store, `observed/${kept}`, new TextEncoder().encode(out.slice(mark).join('\n')));
    return false;
  }
  if (spent.length) process.stderr.write(`SPENT    observe ${spent.join(' · ')} ms\n`);
  if (legacy) setAside(store, speaker);
  process.stderr.write(`OBSERVE  ${ran} run · ${read} read by key${whole_ ? ` · ${whole_} readers kept whole` : ''} · ${Date.now() - began} ms\n`);
  return [...new Set(out)].sort();
}
