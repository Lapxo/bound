#!/usr/bin/env node
import {withContentStore} from '../host/content-store.ts';
import {withoutEffects} from '../host/read-only.ts';
import {resolveSources,resolveRequested} from '../host/source-content.ts';
import {cellsWithReceipts} from '../host/cell-receipts.ts';
import {renderCells} from '@lapxo/topos/cells-view';
import {releasePolicyLines} from '../fold/release-policy.ts';
import {admittedObjects} from '../host/objects.ts';
import {objectFold} from '../fold/object.ts';
import {OBJECT_VIEW} from '@lapxo/topos/wire';
import {toposStanding} from '@lapxo/topos/standing';
import {wireAt,parse as parseWire} from '@lapxo/topos/wire';
import {lockStanding} from '../fold/keys.ts';
import {ownStore,ownLock} from '../observe/runner.ts';
import {signedOwnerLines} from './owner.ts';
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { eraOf, signaturesOf } from '../fold/digests.ts';
import { fullDigest as bootstrapDigest } from '../host/digest.ts';
import { canonical } from '@lapxo/topos/wire';
import { EXTENSION, LOCK, fieldOf, foldClaims, isWire, selfName } from '../fold/claims.ts';
import { observedClaims, readerRefusals } from '../fold/observed.ts';
import { rolesOf } from '../fold/roles.ts';
import { authorityFor, releaseSigner, rootSigner, writerFor } from '../fold/signers.ts';
import { land, ledgerLines, storeOf } from '../land/ledger.ts';
import { lockLines, releaseOf } from '../fold/keys.ts';
import { signConsentLot } from '../land/sign.ts';
import { signerFor } from '../host/signing.ts';
import { admittedIn, ownLockOf, tellOwn } from '../fold/signed.ts';
import { hasVouchedTree, landCoordinates, coordinatesOf, locationsOf, vouching, sourced } from '../land/vouched.ts';
import { observeText } from '../observe/files.ts';
import { askWhy, unrendered, viewOf } from '../render/view.ts';
import { openCards } from '../render/open.ts';
import { foldPlace, ownCeilings, standingOf } from './place.ts';
import { foldPoints, movedPoints } from '../fold/kept.ts';
import type { PlaceFold } from './place.ts';
import { placesOf, sharedShapes, viewsOf } from '../fold/views.ts';
import { placesIn } from '../fold/places.ts';
import { isCeiling } from '../fold/configures.ts';
import { readingsIn } from '../land/inert.ts';
import { pass } from './pass.ts';
import { underTheLock, underTheRegions } from '../land/act.ts';
import { ownerOf, renderInto, signedDemands, targetFile } from './owner.ts';
import { claimLinesIn, entryOf, namedPlaces, positionalsOf, valueOf } from './args.ts';
import { EXIT, FLAGS, NAMED_VIEWS, helpLines } from './names.ts';
import type { VerbName } from './names.ts';
import { accept, signedBatch } from './accept.ts';
import {renderWalk,landWalk,foreignWalkLines} from '../host/walk.ts';
import {isWalkHeader} from '@lapxo/topos/walk';
import {ingressBundles,ingressReceipts} from '../host/ports/ingress.ts';

/** The first land of a lock: TARGET.bound into an empty owner ledger, then the sources that lock names. */
async function firstLand(root: string, args: readonly string[]): Promise<number> {
  const started = Date.now();
  const store = storeOf(root);
  const today = claimLinesIn(targetFile(root));
  const proposed = observeText(targetFile(root));
  let owner: string;
  let keyId: string;
  let born: string;
  let verified = 0;
  let anchored: Record<string, { readonly id: string; readonly publicKey: string; readonly coverage: readonly string[] }>;
  try {
    if (!today.length) throw new Error('REFUSE·bootstrap the proposed lock holds no claims');
    const config = eraOf(today);
    const digestLine = today.find((line) => ['wire/digest-algorithms', 'audit/wire/digest-algorithms'].includes(fieldOf(line, 'scope')) && fieldOf(line, 'value') !== 'withdraw');
    const algorithm = fieldOf(digestLine ?? '', 'value').split('|').filter(Boolean)[0]?.split(':')[0] ?? '';
    if (!algorithm) throw new Error('REFUSE·bootstrap the proposed lock names no digest algorithm');
    owner = writerFor(today, 'authorize') ?? '';
    if (!owner) throw new Error('REFUSE·bootstrap the proposed lock declares no root authorizer');
    keyId = valueOf(args, FLAGS.key) ?? owner;
    if (ledgerLines(store, owner).length) throw new Error('REFUSE·bootstrap the owner ledger already holds claims; the first land happens once');
    const said = (measure: string): string => {
      const values = new Set(today.filter((line) => fieldOf(line, 'scope') === `keys/${owner}` && fieldOf(line, 'measure') === measure && fieldOf(line, 'value') !== 'withdraw').map((line) => fieldOf(line, 'value')));
      if (values.size !== 1) throw new Error(`REFUSE·bootstrap root key ${owner} must declare one ${measure}`);
      return [...values][0]!;
    };
    if (said('class') !== 'authorize') throw new Error('REFUSE·bootstrap the root key must authorize');
    const publicKey = said('public-key');
    const coverage = said('coverage').split('|').filter(Boolean);
    if (!publicKey || !coverage.length) throw new Error('REFUSE·bootstrap the root key must declare its public key and coverage');
    const drafted = today.filter(line => !fieldOf(line, 'sig'));
    if (drafted.length) {
      const invoke = signerFor(today, keyId, valueOf(args, FLAGS.signer), valueOf(args, FLAGS.keyFile));
      const got = await signConsentLot(drafted, { epoch: 1, by: keyId, algorithm: config.era },
        publicKey, config.admitted, invoke);
      if (got.kind === 'refuse') throw new Error(got.why);
      let i = 0;
      today.splice(0, today.length, ...today.map(line => fieldOf(line, 'sig') ? line : got.lines[i++]!));
    }
    const authority = authorityFor(today, { ...releaseSigner(today), id: owner, publicKey, coverage }, config.admitted);
    for (const line of today) {
      const verdict = authority.of(line);
      if (verdict.kind !== 'admitted') throw new Error(`REFUSE·bootstrap ${fieldOf(line, 'scope')} is not admitted: ${verdict.why ?? verdict.kind}`);
      verified += 1;
    }
    // Source receipts require admitted instrument coordinates before the root commit.
    vouching(today);
    sourced(today);
    born = bootstrapDigest(today.map((line) => line.replace(/ sig="[^"]*"/, '')).sort(), algorithm);
    anchored = { [owner]: { id: owner, publicKey, coverage } };
  } catch (error) {
    process.stderr.write(`${selfName()}: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT.refuse;
  }
  // Preflight above performs no writes. Only an admitted batch may establish its root of trust.
  return underTheLock(store, 'bootstrap', () => {
    if (ledgerLines(store, owner).length || observeText(targetFile(root)) !== proposed) {
      process.stderr.write(`${selfName()}: REFUSE·bootstrap the proposed lock or owner ledger changed before commit\n`);
      return EXIT.refuse;
    }
    const landed = land(store, owner, today);
    if (keyId !== owner) land(store, keyId, today);
    const file = join(store, `${selfName()}.keys`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(anchored, null, 2)}\n`);
    const signedLines = today.filter((line) => /\bsig=/.test(line));
    const failing = signedLines.length - verified;
    land(store, 'land', [canonical({
      scope: 'bootstrap', role: 'writes', form: 'alphabet', measure: 'status', value: 'present', by: 'land', at: `bootstrap:${born}`,
      about: 'the lines this clone was born from: one land per clone, and a second is a fork of the same cell',
    })]);
    const rendered = renderInto(root, store);
    process.stdout.write(
      `FACT     landed ${landed.appended} unique lines from ${today.length} in TARGET`
      + ` · ${failing} of ${signedLines.length} signed lines fail admission by declared authority\n`
      + `TARGET   ${rendered.standing} claims · ${rendered.superseded.length} superseded · ${Date.now() - started} ms\n`,
    );
    for (const line of rendered.superseded) process.stdout.write(`SUPERSEDED ${line}\n`);
    if (!hasVouchedTree(store)) {
      const locations = new Set<string>();
      const refused = new Set<string>();
      for (const line of signedDemands(store)) {
        const got = locationsOf(fieldOf(line, 'needs'));
        for (const l of got.locations) locations.add(l);
        for (const r of got.refused) refused.add(r);
      }
      const coordinates = new Map<string, string>();
      const roleOf = rolesOf(store);
      for (const location of locations) for (const [path, digest] of coordinatesOf(root, location, roleOf)) coordinates.set(path, digest);
      const vouched = landCoordinates(store, coordinates, [], 'origin:land');
      process.stdout.write(`FACT     vouched · ${vouched} sources under ${locations.size} locations · ${refused.size} needs refused as globs\n`);
    }
    return EXIT.closed;
  });
}

/** What one fold cost, where it was taken and whether its points had already been folded: a beat of the instrument. */
function beat(root: string, fold: PlaceFold, ms: number): void {
  const folder = writerFor(fold.standing, 'fold');
  const seconds = (n: number): string => `${(n / 1000).toFixed(n < 100 ? 2 : 1)} s`;
  process.stderr.write(`BEAT     fold ${fold.key.slice(0, 8)} ${fold.kept ? 'kept' : 'folded'} ${seconds(ms)}`
    + `${fold.beats.kept ? ` · ${seconds(fold.beats.kept)} kept` : ''}${fold.beats.folded ? ` · ${seconds(fold.beats.folded)} folded` : ''}\n`);
  if (folder === undefined) return;
  if (!fold.kept) {
    const moved = movedPoints(storeOf(root), foldPoints(storeOf(root), fold.standing, fold.under, folder, fold.instrument), fold.key);
    const named = moved === undefined ? 'no fold was kept before this one'
      : `${moved.gone.length} points gone · ${moved.came.length} came · ${[...moved.gone, ...moved.came].slice(0, 3).map((one) => one.split(' ')[0]).join(' ') || 'none'}`;
    process.stderr.write(`KEPT     fold ${fold.key.slice(0, 8)} miss · ${named}\n`);
  }
  land(storeOf(root), folder, [canonical({
    scope: `beat/${fold.under ?? '.'}`, role: 'writes', form: 'interval', measure: 'ms',
    value: `${ms}..${ms}`, by: folder, at: `place:${fold.kept ? 'kept' : 'folded'}`,
  })]);
}

/**
 * A view of a place, rendered from its fold; a shaped one writes the coordinate its shape names. With a batch named, it is the view of the tree
 * as if the batch had landed: the batch is signed and folded, never landed, and nothing is written — `--as rank <batch>`
 * is what a batch would move, read before land.
 */
async function view(root: string, under: string | undefined, asked: string, told: readonly string[] = [], coord?: string, key?: string, includePolicy = true): Promise<number> {
  const [name = asked, depth] = asked.split('@');
  if (name === NAMED_VIEWS.help) {
    process.stdout.write(`${helpLines().join('\n')}\n`);
    return EXIT.closed;
  }
  if (!lockLines(storeOf(root)).length) {
    process.stderr.write(`${selfName()}: the owner ledger is empty; land it before rendering a view\n`);
    return EXIT.refuse;
  }
  if(name==='evidence'&&!under&&!told.length&&ingressBundles(storeOf(root)).length){
    const declared=viewsOf(lockStanding(storeOf(root))).get(name);
    if(!declared||declared.shape||!declared.regions.some(region=>region.name==='evidence'))throw Error('REFUSE·view foreign evidence requires a declared evidence view');
    const received=await foreignWalkLines(root),authority=authorityFor(lockLines(storeOf(root)),rootSigner(root),signaturesOf(storeOf(root)).admitted);
    const local=[...new Set(authority.admitted.flatMap(key=>ledgerLines(storeOf(root),key.id)))].filter(line=>authority.of(line).kind==='admitted');
    for(const line of [...new Set([...local,...ingressReceipts(storeOf(root)),...received])])process.stdout.write(line+'\n');
    process.stdout.write('FACT authenticated histories · readings · no encounters computed\n');
    return EXIT.closed;
  }
  const at = Date.now();
  const place = under?.replace(/\/$/, '');
  const released = releaseOf(storeOf(root));
  const authority = authorityFor([...released ?? lockLines(storeOf(root)), ...told], released ? releaseSigner(released) : rootSigner(root), signaturesOf(storeOf(root), told).admitted);
  const ledger = told.filter((line) => authority.of(line).kind === 'admitted');
  const rest = told.filter((line) => !ledger.includes(line));
  if (place && rest.length) tellOwn(place, rest);
  if (name === NAMED_VIEWS.lines && (told.length || depth === undefined)) {
    const text = standingOf(root, under, ledger).standing.filter(isWire).join('\n');
    process.stdout.write(text ? `${text}\n` : '');
    return EXIT.closed;
  }
  if (told.length) {
    const selected = viewsOf(standingOf(root, under, ledger).standing).get(name);
    if (selected && !selected.shape && selected.regions.some(region => region.name === 'cells')) {
      const history = [...signedOwnerLines(storeOf(root)), ...ledger];
      const held = await admittedObjects(root, history);
      process.stdout.write(`TOLD     ${told.length} lines folded as if landed · nothing written\n`);
      for (const line of renderCells(objectFold(held.records, held.context))) process.stdout.write(line + '\n');
      return EXIT.closed;
    }
  }
  const own = place ? rest.filter((line) => admittedIn(root, place, line)) : [];
  const fold = told.length
    ? foldPlace(root, entryOf(root), under, false, { standing: standingOf(root, under, ledger), observed: observedClaims(root, storeOf(root), { wait: false }), free: true })
    : foldPlace(root, entryOf(root), under, true);
  if (!told.length && readerRefusals().length) {
    for (const why of readerRefusals()) process.stderr.write(`${selfName()}: ${why}\n`);
    return EXIT.refuse;
  }
  if (coord) askWhy(fold, coord);
  if (name === NAMED_VIEWS.lines) {
    if (!told.length) beat(root, fold, Date.now() - at);
    const text = fold.standing.filter(isWire).join('\n');
    process.stdout.write(text ? `${text}\n` : '');
    if (depth === '1') for (const line of readingsIn([...fold.standing.filter(isCeiling), ...ownCeilings(under)], fold)) process.stdout.write(`${line}\n`);
    return EXIT.closed;
  }
  const views = viewsOf(fold.standing);
  const cellsView = [...views.entries()].find(([, one]) => !one.shape && one.regions.some((region) => region.name === 'cells'));
  if (cellsView && name === cellsView[0]) {
    const history=signedOwnerLines(storeOf(root));
    const {objectHistory}=await import('@lapxo/topos/wire');
    const parsed=objectHistory(history);
    if(parsed.kind!=='fact')throw Error(`REFUSE·wire ${parsed.why}`);
    if(parsed.value.objects.length){
      await cellsWithReceipts(root,history,text=>process.stdout.write(text+'\n'));
      if (includePolicy) for (const line of releasePolicyLines(fold.release)) process.stdout.write(line+'\n');
      if (!told.length) beat(root, fold, Date.now() - at);
      return EXIT.closed;
    }
    if (!told.length) beat(root, fold, Date.now() - at);
    const cells = fold.open ?? [];
    const mine = key ? cells.filter((cell) => cell.origins.includes(key)) : cells;
    const cards = openCards(mine);
    if (key) process.stdout.write(`KEY      ${key}\n`);
    if (cards.length) process.stdout.write(`${cards.join('\n')}\n`);
    return EXIT.closed;
  }
  if (!told.length) beat(root, fold, Date.now() - at);
  if (name === 'rank') {
    const asked = place ? [place] : placesIn(root);
    const reds = asked.flatMap((one) => sharedShapes(ownLockOf(root, one)).map((said) => `${one} ${said}`));
    if (reds.length) {
      process.stderr.write(`${selfName()}: REFUSE·rank ${reds.join(' · ')}: two views naming the same shape in one place\n`);
      return EXIT.refuse;
    }
  }
  const signed = views.get(name);
  if (!signed) {
    process.stderr.write(`${selfName()}: no view/${name} is signed; the lock signs ${[...views.keys()].sort().map((v) => `view/${v}`).join(' · ') || 'no view'}\n`);
    return EXIT.usage;
  }
  const missing = unrendered(fold, signed);
  if (missing.length) {
    process.stderr.write(`${selfName()}: REFUSE·view view/${name} asks regions nothing renders: ${missing.join(' ')} · none is the instrument's own and no capsule ${under ?? 'the root'} can run declares it\n`);
    return EXIT.refuse;
  }
  const bound = placesOf(fold.standing, signed);
  if (bound.length && !bound.includes(under ?? '')) {
    process.stderr.write(`${selfName()}: view/${name} writes ${bound.map((place) => `${place}${signed.shape}`).join(' · ')}, and nothing of ${under ?? 'this place'}\n`);
    return EXIT.usage;
  }
  const folder = writerFor(fold.standing, 'fold');
  if (folder !== undefined && !told.length) {
    const spent = Date.now() - at;
    land(storeOf(root), folder, [canonical({
      scope: `beat/${under ?? '.'}`, role: 'writes', form: 'interval', measure: 'ms',
      value: `${spent}..${spent}`, by: folder, at: `place:command-${fold.kept ? 'kept' : 'folded'}`,
    })]);
  }
  const shown = (fold: PlaceFold): number | Promise<number> => {
  const text = viewOf(fold, Number.isFinite(Number(depth)) && depth !== undefined ? { ...signed, regions: signed.regions.map((one) => (one.called ? { ...one, at: Number(depth) } : one)) } : signed);
  if (process.argv.includes(FLAGS.check)) {
    const coordinate = join(root, under ?? '', signed.shape || '');
    const held = signed.shape ? observeText(coordinate) : undefined;
    const same = held !== undefined && held === text;
    if (same) {
      process.stdout.write(`SAME     ${signed.shape || `view/${name}`}\n`);
      return EXIT.closed;
    }
    const heldLines = (held ?? '').split('\n');
    const next = text.split('\n');
    const found = heldLines.findIndex((line, i) => line !== next[i]);
    const at = found < 0 ? Math.min(heldLines.length, next.length) : found;
    const line = (found < 0 ? next[at] : heldLines[at]) ?? next[at] ?? '';
    process.stdout.write(`DIFFERS     ${signed.shape || `view/${name}`}${held === undefined ? ' · this place holds no such region' : ` · line ${at + 1} · ${line}`}\n`);
    return EXIT.refuse;
  }
  if (!signed.shape || told.length) {
    if (told.length) {
      process.stdout.write(`TOLD     ${told.length} lines folded as if landed · ${ledger.length} in the ledger · ${own.length} in ${place ?? 'the root'}'s own lock`
        + `${rest.length - own.length ? ` · ${rest.length - own.length} admitted nowhere` : ''} · the batch lands nothing and nothing is written\n`);
    }
    process.stdout.write(text);
    if (depth === '1') for (const line of readingsIn(told.length ? told.filter(isCeiling) : [...fold.standing.filter(isCeiling), ...ownCeilings(under)], fold)) process.stdout.write(`${line}\n`);
    return EXIT.closed;
  }
  const coordinate = join(root, under ?? '', signed.shape);
  return underTheRegions(storeOf(root), [under ?? ''], `view/${name}`, () => {
    mkdirSync(dirname(coordinate), { recursive: true });
    writeFileSync(coordinate, text);
    process.stdout.write(`RENDERED ${relative(root, coordinate).split(sep).join('/')} · view/${name} · ${text.split('\n').length - 1} lines\n`);
    return EXIT.closed;
  });
  };
  return shown(fold);
}

async function signVerb(root: string, rest: readonly string[]): Promise<number> {
  const batch = await signedBatch(root, rest, positionalsOf(rest));
  if (batch.kind === 'exit') return batch.code;
  if (batch.kind === 'once') {
    process.stderr.write(`ONCE     ${batch.proposed.length} lines · every one already landed: nothing to sign\n`);
    return EXIT.closed;
  }
  for (const place of namedPlaces(rest)) process.stdout.write(`# place ${place}\n`);
  for (const line of batch.signed) process.stdout.write(`${line}\n`);
  process.stderr.write(`SIGNED   ${batch.signed.length} lines · epoch ${batch.epoch}${namedPlaces(rest).length ? ` · own lines for ${namedPlaces(rest).join(', ')}` : ''} · they land together, before the lock moves\n`);
  return EXIT.closed;
}

async function landVerb(root: string, rest: readonly string[]): Promise<number> {
  const lock = resolve(targetFile(root));
  const batch = positionalsOf(rest).filter((one) => {
    const at = resolve(one);
    return existsSync(at) && !lstatSync(at).isDirectory() && at !== lock;
  });
  if (!batch.length) {
    const store = storeOf(root);
    if (existsSync(join(store, 'ledger')) && ledgerLines(store, ownerOf(store)).length) {
      process.stderr.write(`${selfName()}: REFUSE·bootstrap the owner ledger already holds claims; provide an explicit signed batch to change it\n`);
      return EXIT.refuse;
    }
    return firstLand(root, rest);
  }
  const die = (why: string): void => {
    process.stderr.write(`${selfName()}: ${why.startsWith('REFUSE·') ? why : `REFUSE·crash ${why}`}\n`);
    process.exitCode = EXIT.refuse;
  };
  process.once('SIGINT', () => die('SIGINT'));
  process.once('SIGHUP', () => die('SIGHUP'));
  process.once('uncaughtException', (error) => die(error instanceof Error ? error.message : String(error)));
  process.once('unhandledRejection', (error) => die(error instanceof Error ? error.message : String(error)));
  try {
    const proposed=batch.flatMap(claimLinesIn);
    if(proposed.some(isWalkHeader)){
      for(const line of await landWalk(root,proposed,valueOf(rest,FLAGS.key),valueOf(rest,FLAGS.keyFile),valueOf(rest,FLAGS.signer)))process.stdout.write(line+'\n');
      return EXIT.closed;
    }
    return await accept(root, rest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${selfName()}: ${message.startsWith('REFUSE·') ? message : `REFUSE·crash ${message}`}\n`);
    return EXIT.refuse;
  }
}

function foldFile(at: string): number {
  const lines = claimLinesIn(at);
  const folded = foldClaims(lines);
  const fields=folded.standing.flatMap(line=>{const got=parseWire(line);return got.kind==='fact'?[got.value.fields]:[];});
  const isTopos=fields.some(f=>f.scope?.startsWith('region/')&&f.measure==='reads');
  if(isTopos&&folded.forks.length)throw Error('REFUSE·topos incompatible live claims in declared fold');
  const selected=isTopos?toposStanding(folded.standing):undefined;
  if(selected!==undefined){
    const wire=wireAt(ownLock().flatMap(line=>{const got=parseWire(line);return got.kind==='fact'?[got.value.fields]:[];}),Number.MAX_SAFE_INTEGER);
    const algorithm=wire?.digests.values().next().value;
    if(!algorithm)throw Error('REFUSE·topos instrument names no digest algorithm');
    process.stdout.write(selected.split('\n').filter(Boolean).map(line=>'TOPOS '+line).join('\n')+'\n');
    process.stdout.write('PIN '+bootstrapDigest([selected],algorithm)+'\n');
  }
  for (const line of folded.standing) process.stdout.write(`${line}\n`);
  for (const fork of folded.forks) process.stdout.write(`FORK     ${fork.key}${fork.state ? ` · ${fork.state}` : ''}\n`);
  process.stdout.write(`FACT     ${folded.standing.length} standing · ${folded.forks.length} forks · ${basename(at)} · readings · no encounters computed\n`);
  return EXIT.closed;
}

function foldVerb(root: string, rest: readonly string[]): number | Promise<number> {
  const files = positionalsOf(rest).filter((one) => existsSync(resolve(one)) && !lstatSync(resolve(one)).isDirectory() && one.endsWith(EXTENSION));
  const places = positionalsOf(rest).filter((one) => existsSync(resolve(one)) && lstatSync(resolve(one)).isDirectory());
  if (files.length === 1 && !places.length && valueOf(rest, FLAGS.as) === undefined) {
    const at = resolve(files[0]!);
    if (!at.endsWith(`/${LOCK}`) && at !== LOCK) return foldFile(at);
    return foldAt(dirname(at), undefined, rest);
  }
  const under = places[0];
  // A prospective lot is data, not the place whose authority admits it.
  const tree = files.length ? root : resolve('.');
  const place = under ? relative(tree, resolve(under)).split(sep).join('/') : '';
  return foldAt(tree, place ? `${place}/` : undefined, rest);
}

async function foldAt(root: string, under: string | undefined, argv: readonly string[]): Promise<number> {
  return withContentStore(storeOf(root),()=>foldRequested(root,under,argv),()=>standingOf(root,under).standing);
}

async function foldRequested(root: string, under: string | undefined, argv: readonly string[]): Promise<number> {
  const as = valueOf(argv, FLAGS.as);
  const prospective = as !== undefined && positionalsOf(argv).some(one => existsSync(resolve(one)) && !lstatSync(resolve(one)).isDirectory());
  if(as===NAMED_VIEWS.help || prospective || argv.includes(FLAGS.check))return foldResolved(root,under,argv);
  return resolveRequested(digest=>resolveSources(standingOf(root,under).standing,[digest]),()=>foldResolved(root,under,argv));
}

async function foldResolved(root: string, under: string | undefined, argv: readonly string[]): Promise<number> {
  const as = valueOf(argv, FLAGS.as);
  const inputs = positionalsOf(argv).filter(one => existsSync(resolve(one)) && !lstatSync(resolve(one)).isDirectory());
  // Public content is authenticated by its digest, independently of owner history.
  // A named view does not request mounting every release of the instrument.
  const receiptCheck = as === undefined && argv.includes(FLAGS.check);

  if(as?.split('@')[0]==='walk'){
    if(argv.includes(FLAGS.check))throw Error('REFUSE·walk check does not initiate or sign an exchange');
    if(under||inputs.length>1)throw Error('REFUSE·walk one place and one authenticated peer inventory per fold');
    const depth=as.split('@')[1];if(depth!==undefined&&(!/^(0|[1-9][0-9]*)$/.test(depth)||!Number.isSafeInteger(Number(depth))))throw Error('REFUSE·walk invalid resolution');
    const peer=inputs.length?claimLinesIn(inputs[0]!):[];
    for(const line of await renderWalk(root,depth===undefined?undefined:Number(depth),peer,valueOf(argv,FLAGS.key),valueOf(argv,FLAGS.keyFile),valueOf(argv,FLAGS.signer)))process.stdout.write(line+'\n');
    return EXIT.closed;
  }

  if(as===OBJECT_VIEW){const inputs=positionalsOf(argv).filter(one=>existsSync(resolve(one))&&!lstatSync(resolve(one)).isDirectory());if(inputs.length>1)throw Error('REFUSE·object one history snapshot per fold');const history=inputs.length?claimLinesIn(inputs[0]!):signedOwnerLines(storeOf(root));const held=await admittedObjects(root,history,text=>process.stdout.write(text+'\n'));const cells=objectFold(held.records,held.context);for(const c of cells)process.stdout.write('CELL '+JSON.stringify(c)+'\n');process.stdout.write(`FACT     object fold ${cells.length} cells\n`);return EXIT.closed;}
  const key = valueOf(argv, FLAGS.key);
  if (as === undefined) {
    const exit=await pass(root, entryOf(root), under, argv.includes(FLAGS.check));
    if (receiptCheck) return exit;
    if(exit!==0)return exit;
    const history=signedOwnerLines(storeOf(root));
    const {objectHistory}=await import('@lapxo/topos/wire');
    const parsed=objectHistory(history);
    if(parsed.kind!=='fact')throw Error(`REFUSE·wire ${parsed.why}`);
    if(parsed.value.objects.length){
      const signedCells=[...viewsOf(history).values()].find(one=>!one.shape&&one.regions.some(region=>region.name==='cells'));
      if(!signedCells)throw Error('REFUSE·view object cells require a signed cells view');
      return view(root,under,signedCells.name, [], undefined, undefined, false);
    }
    return exit;
  }
  const named = inputs;
  const coord = positionalsOf(argv).find((one) => one !== under?.replace(/\/$/, '') && !one.startsWith('-') && !(existsSync(resolve(one)) && lstatSync(resolve(one)).isDirectory()));
  if ((as === 'why' || as === NAMED_VIEWS.because || as.split('@')[0] === 'why') && coord !== undefined) return view(root, under, as === NAMED_VIEWS.because ? 'why' : as, [], coord, key);
  if (!named.length) return view(root, under, as, [], undefined, key);
  const batch = await signedBatch(root, argv, named);
  if (batch.kind === 'exit') return batch.code;
  if (batch.kind === 'once') process.stdout.write(`ONCE     ${batch.proposed.length} lines · every one already landed: the view folds the tree as it stands\n`);
  return withoutEffects(() => view(root, under, as, batch.kind === 'signed' ? batch.signed : batch.proposed, undefined, key));
}

const VERBS: Readonly<Record<VerbName, (root: string, rest: readonly string[], argv: readonly string[]) => number | Promise<number>>> = {
  fold: (root, rest) => foldVerb(root, rest),
  land: (root, rest) => landVerb(root, rest),
  sign: (root, rest) => signVerb(root, rest),
};

function main(argv: readonly string[]): number | Promise<number> {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) continue;
    if (!(Object.values(FLAGS) as readonly string[]).includes(arg)) {
      process.stderr.write(`${selfName()}: REFUSE·flag unknown option ${arg}\n`);
      return EXIT.usage;
    }
    if (arg !== FLAGS.check) {
      if (argv[i + 1] === undefined || argv[i + 1]!.startsWith('--')) {
        process.stderr.write(`${selfName()}: REFUSE·flag ${arg} needs a value\n`);
        return EXIT.usage;
      }
      i += 1;
    }
  }
  const verb = argv[0] ?? '';
  const run = verb in VERBS ? VERBS[verb as VerbName] : undefined;
  const places = positionalsOf(run === undefined ? argv : argv.slice(1)).filter((one) => existsSync(resolve(one)) && lstatSync(resolve(one)).isDirectory());
  if (run !== undefined) {
    const root=resolve(places[0] ?? '.');
    return withContentStore(storeOf(root),()=>run(root,argv.slice(1),argv));
  }
  const under = argv[0] ?? '';
  if (under && !under.startsWith('-') && places.includes(under)) {
    const root = resolve('.');
    const place = relative(root, resolve(under)).split(sep).join('/');
    return foldAt(root, place ? `${place}/` : undefined, argv);
  }
  process.stderr.write(`${selfName()}: ${helpLines().join(' · ')}\n`);
  return EXIT.usage;
}

// The same refusal boundary covers synchronous operations and asynchronous processes.
const refused = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${selfName()}: ${message.startsWith('REFUSE·') ? message : `REFUSE·crash ${message}`}\n`);
  process.exitCode = EXIT.refuse;
};
try {
  const ran = main(process.argv.slice(2));
  if (ran instanceof Promise) ran.then((code) => { process.exitCode = code; }).catch(refused);
  else process.exitCode = ran;
} catch (error) { refused(error); }
