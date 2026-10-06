import {selectedWireAt} from '../host/selected-topos.ts';
import { timing } from '../host/timing.ts';
import {admittedObjects} from '../host/objects.ts';
import { existsSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { closeReceipts, instrumentKeep, instrumentKept } from '../fold/closed.ts';
import { bytesDigest, fullDigest, instrumentOf, signaturesOf } from '../fold/digests.ts';
import { canonical, fromLine, LOCK, parse } from '@lapxo/topos/wire';
import { fieldOf, isConfig, foldClaims, sayingOf, selfName } from '../fold/claims.ts';
import { isReaderLock } from '../fold/observed.ts';
import { authorityFor, publicKeyOf, rootSigner, writerFor } from '../fold/signers.ts';
import { lockLines, lockStanding } from '../fold/keys.ts';
import { keepVerdict, keptVerdict, land, landBlob, storeOf } from '../land/ledger.ts';
import { signConsentLot, verifiesOwnerLine } from '../land/sign.ts';
import { signerFor } from '../host/signing.ts';
import { appliedIn, ownLockOf } from '../fold/signed.ts';
import { wordOf } from '../fold/wire.ts';
import { hasVouchedTree, landCoordinates, locationsOf, vouchedCoordinates } from '../land/vouched.ts';
import { entriesIn, observeFile, observeText } from '../observe/files.ts';
import { coneOf, standingOf } from './place.ts';
import { ownLock, ownRoot, ownStore } from '../observe/runner.ts';
import { widenedWithoutWitness } from '../judge/widening.ts';
import { retractedTogether, withdrawal } from '../land/withdraw.ts';
import { isCeiling } from '../fold/configures.ts';
import { inertIn, rankedIn } from '../land/inert.ts';
import { landSaid } from './pass.ts';
import { underTheLock, underTheRegions } from '../land/act.ts';
import { openedBy } from '../fold/opened.ts';
import { touchedBy } from '../fold/reach.ts';
import { landOwned, ownedOf } from '../land/owned.ts';
import type { Owned } from '../land/owned.ts';
import { layReleases } from '../host/release.ts';
import { foundableIn, placesIn } from '../fold/places.ts';
import { outsideTheirCapsule } from '../fold/own.ts';
import { lateFacts } from '../judge/late.ts';
import { paidOf } from '../fold/paid.ts';
import { aliasPinned } from '../land/alias.ts';
import { coordinatesWithdrawn } from '../land/leaving.ts';
import { ownerOf, epochOf, forksItself, forksJoinedBy, renderInto, sideOf, signedDemands, signedOwnerLines } from './owner.ts';
import { claimLinesIn, entryOf, namedPlaces, placesOfFile, positionalsOf, valueOf } from './args.ts';
import { FLAGS } from './names.ts';
import { judgeDemand, landTake } from './takes.ts';
import type { Judged } from './takes.ts';

export type Batch = { readonly kind: 'signed'; readonly signed: readonly string[]; readonly epoch: number; readonly keyId?: string } | { readonly kind: 'once'; readonly proposed: readonly string[] } | { readonly kind: 'exit'; readonly code: number };

/** A batch signed as accept signs it: at the next epoch, by the key it names, each line read by the wire it would land under. */
export async function signedBatch(root: string, args: readonly string[], files: readonly string[]): Promise<Batch> {
  const byFile = files.map((file) => [placesOfFile(file), claimLinesIn(file)] as const);
  const proposed = byFile.flatMap(([, lines]) => lines);
  if (!proposed.length) {
    process.stderr.write(`${selfName()}: a batch is a file with claim lines\n`);
    return { kind: 'exit', code: 2 };
  }
  const drafted = proposed.filter((line) => !fieldOf(line, 'sig'));
  const bare = drafted.filter((line) => fieldOf(line, 'epoch') || !['', 'target'].includes(fieldOf(line, 'by')));
  if (bare.length) {
    for (const line of bare) process.stderr.write(`BARE     ${fieldOf(line, 'scope')} · by=${fieldOf(line, 'by') || '∅'}${fieldOf(line, 'epoch') ? ` epoch=${fieldOf(line, 'epoch')}` : ''}\n`);
    process.stderr.write(`${selfName()}: REFUSE·bare nothing landed · ${bare.length} lines name a signer or an epoch they were not signed with: a drafted line proposes by=target and sign signs it, a line a lane signed carries its sig\n`);
    return { kind: 'exit', code: 1 };
  }
  const store = storeOf(root);
  const destinations = [...new Set([...namedPlaces(args), ...byFile.flatMap(([heads]) => heads)])];
  const epoch = epochOf([...lockLines(store), ...destinations.flatMap((place) => appliedIn(root, place))]) + 1;
  const stale = proposed.filter((line) => fieldOf(line, 'sig')).flatMap((line) => ((by, key) => (key === undefined || !verifiesOwnerLine(line, key, signaturesOf(store).admitted)
    ? [`${fieldOf(line, 'scope')} · the signature does not hold for ${by || '∅'}`]
    : isConfig(line) && Number(fieldOf(line, 'epoch')) !== epoch ? [`${fieldOf(line, 'scope')} · signed by ${by} at epoch ${fieldOf(line, 'epoch')}, and this act lands at ${epoch}: sign it again`] : []))(fieldOf(line, 'by'), publicKeyOf(root, fieldOf(line, 'by'))));
  if (stale.length) {
    for (const one of stale) process.stderr.write(`SIGNED   ${one}\n`);
    process.stderr.write(`${selfName()}: REFUSE·signed nothing landed · ${stale.length} lines a lane signed stand at no epoch this act\n`);
    return { kind: 'exit', code: 1 };
  }
  const [named, places] = [namedPlaces(args), placesIn(root)];
  const inLock = new Set(lockLines(store).map(sayingOf));
  const inPlace = new Map(places.map((place) => [place, new Set(appliedIn(root, place).map(sayingOf))] as const));
  const held = (line: string, at = named.length ? named : byFile.flatMap(([heads, lines]) => (lines.includes(line) ? heads : []))): boolean => at.length
    ? at.every((place) => inPlace.get(place)?.has(sayingOf(line)))
    : inLock.has(sayingOf(line)) || places.some((place) => inPlace.get(place)?.has(sayingOf(line)));
  if (proposed.every((line) => held(line))) {
    if(proposed.some(line=>!isConfig(line))) {try {await admittedObjects(root,[...signedOwnerLines(store),...proposed]);}catch(e){process.stderr.write(`${selfName()}: ${String(e)} · nothing landed\n`);return {kind:'exit',code:1};}}
    return { kind: 'once', proposed };
  }
  const keyFile = valueOf(args, FLAGS.keyFile);
  const keyId = valueOf(args, FLAGS.key) ?? ownerOf(store);
  const publicKey = drafted.length ? publicKeyOf(root, keyId) : undefined;
  if (drafted.length && !publicKey) {
    process.stderr.write(`${selfName()}: unknown key ${keyId} — name it in ${selfName()}.keys\n`);
    return { kind: 'exit', code: 2 };
  }
  let signed: string[] = proposed.filter((line) => fieldOf(line, 'sig'));
  if (drafted.length) {
    let invoke;
    try { invoke = signerFor([...lockStanding(store), ...destinations.flatMap(place => ownLockOf(root, place))],
      keyId, valueOf(args, FLAGS.signer), keyFile); }
    catch (error) {
      process.stderr.write(`${selfName()}: ${error instanceof Error ? error.message : 'REFUSE·signer unavailable'}\n`);
      return { kind: 'exit', code: 1 };
    }
    const got = await signConsentLot(drafted, { epoch, by: keyId, algorithm: signaturesOf(store).era },
      publicKey!, signaturesOf(store).admitted, invoke);
    if (got.kind === 'refuse') {
      process.stderr.write(`${selfName()}: ${got.why}\n`);
      return { kind: 'exit', code: 1 };
    }
    let index = 0;
    signed = proposed.map(line => fieldOf(line, 'sig') ? line : got.lines[index++]!);
  }
  const wireLines = [...signedOwnerLines(store), ...signed].flatMap((line) => {
    const got = parse(line);
    return got.kind === 'fact' ? [got.value.fields] : [];
  });
  for (const line of signed) {
    const got = fromLine(line, selectedWireAt(wireLines,Number(fieldOf(line, 'epoch')), foldClaims(signedOwnerLines(store)).standing.filter(one=>fieldOf(one,'scope').startsWith('uses/')&&fieldOf(one,'value')!=='withdraw')));
    if (got.kind !== 'fact') {
      process.stderr.write(`${selfName()}: REFUSE·wire ${fieldOf(line, 'scope')} · ${got.why} · nothing landed\n`);
      return { kind: 'exit', code: 1 };
    }
  }
  const authority = authorityFor([...lockLines(store), ...signed], rootSigner(root), signaturesOf(store).admitted);
  const ownership = ownedOf(root, signed, line => authority.of(line).kind === 'admitted',
    by => authority.admitted.find(one => one.id === by)?.coverage ?? [], named,
    line => { const heads = byFile.flatMap(([heads, lines]) => lines.some(draft => sayingOf(draft) === sayingOf(line)) ? heads : []); return heads.length ? heads : undefined; });
  if (ownership.nowhere.length) {
    for (const line of ownership.nowhere) process.stderr.write(`${selfName()}: REFUSE·signer ${keyId} uncovered ${fieldOf(line, 'scope')} · nothing signed for delivery\n`);
    return { kind: 'exit', code: 1 };
  }
  if(signed.some(line=>!isConfig(line))) {try {await admittedObjects(root,[...signedOwnerLines(store),...signed],text=>process.stdout.write(text+'\n'));}catch(e){process.stderr.write(`${selfName()}: ${e instanceof Error?e.message:String(e)} · nothing landed\n`);return {kind:'exit',code:1};}}
  return { kind: 'signed', signed, epoch, ...(drafted.length ? { keyId } : {}) };
}

/**
 * accept is one act under the descent of its lines. Every place, then the root where they join, only when those lines
 * rest on every place; a line in one place's own lock is that place. It signs the batch at the epoch the lock
 * stands at, folds it, judges every take of it, and lands only when all of it holds. A batch refused lands nothing.
 * What a batch would move is read before it with `--as rank <batch>`. A cycle's lanes each sign
 * their batch with `bound sign` at the epoch the act lands at, and one land takes them all, each line in its signer's
 * ledger once it verifies against that signer: one signer never forks itself, and one act never forks itself.
 */
export async function accept(root: string, args: readonly string[]): Promise<number> {
  const started = Date.now();
  const named = namedPlaces(args);
  const placed = positionalsOf(args).reduce((all, file) => ((places) => (places.length ? claimLinesIn(file).reduce((got, line) => got.set(sayingOf(line), [...new Set([...(got.get(sayingOf(line)) ?? []), ...places])]), all) : all))(placesOfFile(file)), new Map<string, readonly string[]>());
  const rooted = lockStanding(storeOf(root));
  const stray = [...new Set([...named, ...[...placed.values()].flat()])].filter((one) => !placesIn(root).includes(one) && !foundableIn(root, rooted, wordOf(rooted, 'families', 'region'), one));
  if (stray.length) {
    process.stderr.write(`${selfName()}: REFUSE·place nothing landed · ${stray.join(', ')} is no place of the tree, and no line of the root founds it: --place names the own lock a line lands in\n`);
    return 2;
  }
  const batch = await signedBatch(root, args, positionalsOf(args));
  if (batch.kind === 'exit') return batch.code;
  if (batch.kind === 'once') return underTheLock(storeOf(root), 'land', () => repaid(root, batch.proposed, started));
  const taken = retractedTogether(batch.signed);
  if (taken.length) {
    for (const pair of taken) {
      process.stderr.write(`WITHDRAW ${sayingOf(pair.withdraw)}\n`);
      process.stderr.write(`NEW      ${sayingOf(pair.line)}\n`);
    }
    process.stderr.write(`${selfName()}: REFUSE·withdraw nothing landed · a withdraw matches a new line in this batch, so it takes that line too\n`);
    return 1;
  }
  const store = storeOf(root);
  const authority = authorityFor([...lockLines(store), ...batch.signed], rootSigner(root), signaturesOf(store).admitted);
  const owned = ownedOf(root, batch.signed, (line) => authority.of(line).kind === 'admitted', (by) => authority.admitted.find((one) => one.id === by)?.coverage ?? [], named, (line) => placed.get(sayingOf(line)));
  if (owned.nowhere.length) {
    for (const line of owned.nowhere) process.stderr.write(`NOWHERE  ${fieldOf(line, 'scope')} · ${((got) => (got.kind === 'admitted' ? 'admitted' : got.why))(authority.of(line))}, and ${named.length ? `no place of ${named.join(', ')} takes it` : 'no one own lock it covers takes it: name the places with --place'}\n`);
    process.stderr.write(`${selfName()}: REFUSE·nowhere nothing landed · ${owned.nowhere.length} lines neither the ledger nor an own lock admits: a line is landed signed where it stands, never written in bare\n`);
    return 1;
  }
  if (owned.forked.length) {
    for (const one of owned.forked) process.stderr.write(`FORKED   ${one.place}/${LOCK} · ${one.key} · the lot would leave two standing claims where the lock had one\n`);
    process.stderr.write(`${selfName()}: REFUSE·forked nothing landed · ${owned.forked.length} claims an own lot would fork: a lot for many places lands the same lines at each, and lines meant for one place go in a lot of their own\n`);
    return 1;
  }
  const places = placesIn(root);
  const pinned = [...new Set([...owned.own.keys(), ...named])];
  const touched = pinned.length === 0 && owned.ledger.length ? touchedBy(root, places, owned.ledger, lockStanding(store)) : [];
  const every = pinned.length === 0 && touched.length === places.length && places.length > 0;
  const regions = (pinned.length ? pinned : every ? places : touched).filter((one) => places.includes(one));
  const where = every ? 'every place · then the root, where the places join' : regions.length ? regions.map((one) => `${one}/`).join(' · ') : 'the root alone, where the places join';
  process.stdout.write(`ACTS     ${where} · ${owned.ledger.length} lines to the ledger${[...owned.own].map(([place, lines]) => ` · ${lines.length} to ${place}'s own lock`).join('')} · before the lock\n`);
  const asked = Date.now();
  return underTheRegions(store, every ? [...regions, ''] : regions, 'land', () => acceptNow(root, { ...batch, signed: owned.ledger }, started, owned, asked, regions));
}

async function acceptNow(root: string, batch: Extract<Batch, { readonly kind: 'signed' }>, started: number, owned: Owned, asked = started, descent: readonly string[] = []): Promise<number> {
  const waited = Date.now() - asked;
  if (waited > 60_000) process.stdout.write(`RED      wait ${Math.round(waited / 1000)} s for the lock before the act · a wait over a minute is a red\n`);
  const spent: string[] = [`sign ${asked - started}`, `wait ${waited}`];
  const took = timing(spent);
  const { signed, epoch } = batch;
  const store = storeOf(root);
  if(signed.some(line=>!isConfig(line))) {
    try {await admittedObjects(root,[...signedOwnerLines(store),...signed]);}
    catch(e){process.stderr.write(`${selfName()}: ${e instanceof Error?e.message:String(e)} · nothing landed\n`);return 1;}
  }
  const reads = !signed.some(isReaderLock) && signed.some(isCeiling);
  const fold = reads ? took('cone', () => coneOf(root, entryOf(root), signed.filter(isCeiling), descent)) : { ...took('lines', () => standingOf(root)), observed: [], own: {}, kept: true };
  const inert = inertIn(signed, { standing: fold.standing, ceiling: isCeiling, signsReader: !reads, observed: fold.observed, own: fold.own, epoch });
  const widened = widenedWithoutWitness(signed, fold.standing, isCeiling, wordOf(fold.standing, 'at-classes', 'witness'));
  if (widened.length) {
    for (const line of widened) process.stderr.write(`WIDER    ${fieldOf(line, 'scope')} · ${fieldOf(line, 'value')}\n`);
    process.stderr.write(`${selfName()}: REFUSE·widening nothing landed · a ceiling that admits more than it did gives back freedom the lock had spent: sign it under a witness that names what made the old ceiling wrong\n`);
    return 1;
  }
  if (inert.length) {
    for (const line of inert) process.stderr.write(`INERT    ${fieldOf(line, 'scope')} measure=${fieldOf(line, 'measure')}\n`);
    process.stderr.write(`${selfName()}: REFUSE·inert nothing landed · no reading meets these ceilings: sign the reader that meets them in this batch, or leave them out\n`);
    return 1;
  }
  const outside = outsideTheirCapsule(root, fold.standing, signed);
  for (const line of outside) process.stderr.write(`OUTSIDE  ${fieldOf(line, 'scope')} · ${fieldOf(line, 'value')}\n`);
  if (outside.length) {
    process.stderr.write(`${selfName()}: REFUSE·outside nothing landed · a reader or a capsule lands in the capsule of its world, never in the wire or the instrument\n`);
    return 1;
  }
  const forks = took('fork', () => forksJoinedBy(store, signed).filter((fork) => forksItself(fork.lines) || fork.lines.filter((line) => signed.includes(line)).length > 1));
  if (forks.length) {
    for (const fork of forks) {
      process.stderr.write(`FORK     ${fork.key}\n`);
      for (const line of fork.lines) process.stderr.write(`  ${signed.includes(line) ? 'new ' : 'held'}  by=${fieldOf(line, 'by')} ${sideOf(line, lockLines(store))}\n`);
    }
    process.stderr.write(`${selfName()}: REFUSE·fork nothing landed · one signer never forks itself, and one act never forks itself: withdraw the held side in this batch, or sign the other reading under its own scope\n`);
    return 1;
  }
  if (reads) for (const line of rankedIn(signed.filter(isCeiling), fold)) process.stdout.write(`${line}\n`);
  const authority = took('authority', () => authorityFor([...lockLines(store), ...signed], rootSigner(root), signaturesOf(store).admitted));
  for (const line of signed) {
    const verdict = authority.of(line);
    if (verdict.kind !== 'admitted') {
      process.stderr.write(`${selfName()}: ${verdict.kind === 'refuse' ? verdict.why : `REFUSE·authority grey: ${verdict.why}`}\n`);
      return 1;
    }
  }
  const coordinates = coordinatesWithdrawn(root, store, signed, [...signed, ...fold.standing]);
  if (coordinates.refused.length) {
    for (const one of coordinates.refused) process.stderr.write(`RUN      ${one.path} · still read by ${one.by}\n`);
    process.stderr.write(`${selfName()}: REFUSE·withdraw nothing landed · a file a block still reads cannot leave: withdraw what reads it first, or keep it\n`);
    return 1;
  }
  const withdraws = signed.filter((line) => fieldOf(line, 'value') === 'withdraw');
  const withdrawn = withdraws.length ? withdrawal(withdraws, lockLines(store)) : null;
  const view = `${wordOf(fold.standing, 'families', 'view')}/`;
  const lot = fullDigest(store, signed);
  const tree = hasVouchedTree(store)
    ? fullDigest(store, [...vouchedCoordinates(store)].sort(([a], [b]) => a.localeCompare(b)).map(([coordinate, digest]) => `${coordinate} ${digest}`))
    : 'key' in fold && typeof fold.key === 'string' ? fold.key : fullDigest(store, fold.standing);
  const cached = keptTakes(keptVerdict(store, tree, lot));
  const judged = cached ?? took('takes', () => signed.filter((one) => fieldOf(one, 'role') === 'demands' && fieldOf(one, 'value') !== 'withdraw' && !fieldOf(one, 'scope').startsWith(view))
    .map((line) => judgeDemand(root, line)));
  if (!cached) keepVerdict(store, tree, lot, judged.map(packTake));
  const refused = judged.filter((one) => one.kind === 'refused' || (one.kind === 'judged' && one.verdict.kind === 'refuse'));
  if (refused.length) {
    for (const one of refused) process.stdout.write(`REFUSE   take ${one.scope} · ${one.kind === 'judged' ? one.verdict.why : one.kind === 'refused' ? one.why : ''}\n`);
    process.stderr.write(`${selfName()}: REFUSE·takes nothing landed · ${refused.length} takes refused: a batch lands whole or not at all\n`);
    return 1;
  }
  const held = aliasPinned(root, signed);
  if (held.length) {
    for (const one of held) process.stderr.write(`ALIAS    ${one.scope} · ${one.digest} · ${one.by.join(' ')}\n`);
    process.stderr.write(`${selfName()}: REFUSE·alias nothing landed · an alias is withdrawn only when no pin names its digest\n`);
    return 1;
  }
  const told = took('told', () => standingOf(root, undefined, signed));
  for (const name of openedBy(descent, told.standing, signed)) process.stderr.write(`OPEN     ${name}\n`);
  if (owned.own.size) layReleases(store, ownRoot(), ownLock(), ownStore());
  const landed = took('land', () => [...new Set(signed.map((line) => fieldOf(line, 'by')))].map((by) => land(store, by, signed.filter((line) => fieldOf(line, 'by') === by))));
  for (const [place, lines] of owned.own) landOwned(root, place, lines);
  landSaid(store, writerFor(told.standing, 'fold'), []);
  for (const line of signed) {
    const value = fieldOf(line, 'value');
    if (!/^[a-z0-9-]+:[0-9a-f]{32,}$/.test(value)) continue;
    for (const need of locationsOf(fieldOf(line, 'needs')).locations) {
      const at = join(root, need);
      const bytes = observeFile(at);
      if (bytes === undefined) continue;
      if (bytesDigest(store, bytes) === value) landBlob(store, value, bytes);
    }
  }
  if (coordinates.taken.length) {
    for (const path of coordinates.taken) {
      if (existsSync(join(root, path))) rmSync(join(root, path), { recursive: true });
      for (let dir = dirname(path); dir !== '.' && existsSync(join(root, dir)) && !entriesIn(join(root, dir)).length; dir = dirname(dir)) rmdirSync(join(root, dir));
    }
    landCoordinates(store, new Map(), coordinates.taken, `withdraw:epoch-${epoch}`);
    for (const path of coordinates.taken) process.stdout.write(`GONE     ${path} · withdrawn by its line\n`);
  }
  for (const one of judged) landTake(root, one, []);
  const standingAsked = [...signed, ...fold.standing].filter((line) => fieldOf(line, 'role') === 'demands' && fieldOf(line, 'value') !== 'withdraw');
  const paidScopes = new Set(paidOf(store, standingAsked, fold.observed, view).paid.map((line) => fieldOf(line, 'scope')));
  const late = lateFacts(store, [...signed, ...fold.standing], paidScopes);
  if (late.length) {
    land(store, 'judge', late);
    for (const line of late) if (fieldOf(line, 'measure') !== 'cone') process.stdout.write(`LATE     ${fieldOf(line, 'scope')} · answered from the landed cone\n`);
  }
  if (signed.some((line) => fieldOf(line, 'scope').startsWith(`${basename(ownRoot())}/`) && !fieldOf(line, 'scope').split('/').slice(1, -1).includes('uses'))) {
    const code = instrumentOf(store, entryOf(root), told.standing, root, ownLock());
    if (instrumentKept(store) !== code) {
      const open = await closeReceipts(root, store);
      instrumentKeep(store, code);
      process.stderr.write(`open by instrument · ${open.length}\n`);
    }
  }
  const rendered = took('render', () => renderInto(root, store));
  process.stdout.write(`RENDER 0\n`);
  const own = new Set([...owned.own.values()].flat()).size;
  const perLine = Math.round((Date.now() - started) / Math.max(1, signed.length + own));
  const folder = writerFor(fold.standing, 'fold');
  const beat = (ms: number, at: string): string => canonical({ scope: 'beat/accept', role: 'writes', form: 'interval', measure: 'ms', value: `${ms}..${ms}`, by: folder ?? '', at: `place:${at}` });
  if (folder !== undefined) land(store, folder, [beat(perLine, 'line'), beat(1, fold.kept ? 'kept' : 'folded'), beat(Date.now() - started, 'total')]);
  process.stdout.write(
    `FACT     signed ${signed.length + own} · landed ${landed.length ? landed.map((one) => `${one.appended} in ${one.at}`).join(' · ') : '0'}${[...owned.own].map(([place, lines]) => ` · ${lines.length} in ${place}/${LOCK}`).join('')} · epoch ${epoch}\n`
    + `TARGET   ${rendered.standing} claims · ${rendered.forks.length} forks · ${rendered.vacuous.length} vacuous · ${rendered.grey.length} grey · ${rendered.refused.length} refused · ${Date.now() - started} ms\n`
    + `SPENT    ${spent.join(' ms · ')} ms · ${signed.length} lines\n`,
  );
  if (withdrawn) {
    process.stdout.write(`WITHDRAW ${withdrawn.taken.length} taken · ${withdrawn.exact.length} exact on distributive scales · ${withdrawn.open.length} on open scales, not computed\n`);
    for (const line of withdrawn.inexact) process.stdout.write(`INEXACT  ${fieldOf(line, 'scope')} · its scale is not distributive: what the others hold is not what they held without it\n`);
  }
  return 0;
}

/**
 * A batch landed twice is one: nothing of it lands again. What it left unpaid is judged again, the way it would be now:
 * each of its demands the fold counts unpaid is taken, and the takes land only when all of it holds.
 */
function repaid(root: string, proposed: readonly string[], started: number): number {
  const store = storeOf(root);
  const asked = new Set(proposed.filter((line) => fieldOf(line, 'role') === 'demands').map((line) => fieldOf(line, 'scope')));
  const view = `${wordOf(foldClaims(signedOwnerLines(store)).standing, 'families', 'view')}/`;
  const standingAsked = signedDemands(store).filter((line) => asked.has(fieldOf(line, 'scope')) && !fieldOf(line, 'scope').startsWith(view));
  const owed = paidOf(store, standingAsked, [], view).missing;
  if (!owed.length) {
    process.stdout.write(`ONCE     ${proposed.length} lines · every one already landed and every demand of it paid: a batch landed twice is one, nothing landed\n`);
    return 0;
  }
  const judged = owed.map((line) => judgeDemand(root, line));
  process.stdout.write(`ONCE     ${proposed.length} lines · every one already landed · ${owed.length} of its demands unpaid, judged again\n`);
  if (judged.every((one) => one.kind === 'owed')) {
    for (const one of judged) landTake(root, one, []);
    return 0;
  }
  const refused = judged.filter((one) => one.kind === 'refused' || (one.kind === 'judged' && one.verdict.kind === 'refuse'));
  if (refused.length) {
    for (const one of refused) process.stdout.write(`REFUSE   take ${one.scope} · ${one.kind === 'judged' ? one.verdict.why : one.kind === 'refused' ? one.why : ''}\n`);
    process.stderr.write(`${selfName()}: REFUSE·takes nothing landed · ${refused.length} takes refused: what a batch left unpaid is paid whole or not at all\n`);
    return 1;
  }
  const standing = standingOf(root);
  for (const one of judged) landTake(root, one, []);
  landSaid(store, writerFor(standing.standing, 'fold'), []);
  const unpaidStanding = standing.standing.filter((line) => fieldOf(line, 'role') === 'demands' && fieldOf(line, 'value') !== 'withdraw');
  const paidScopes = new Set(paidOf(store, unpaidStanding, [], `${wordOf(standing.standing, 'families', 'view')}/`).paid.map((line) => fieldOf(line, 'scope')));
  const late = lateFacts(store, standing.standing, paidScopes);
  if (late.length) {
    land(store, 'judge', late);
    for (const line of late) if (fieldOf(line, 'measure') !== 'cone') process.stdout.write(`LATE     ${fieldOf(line, 'scope')} · answered from the landed cone\n`);
  }
  const rendered = renderInto(root, store);
  process.stdout.write(`RENDER 0\n`);
  process.stdout.write(`TARGET   ${rendered.standing} claims · ${rendered.forks.length} forks · ${rendered.vacuous.length} vacuous · ${rendered.grey.length} grey · ${rendered.refused.length} refused · ${Date.now() - started} ms\n`);
  return 0;
}

function packTake(one: Judged): unknown {
  return one.kind === 'judged'
    ? { kind: one.kind, scope: one.scope, demand: one.demand, locations: one.locations, before: [...one.before], after: [...one.after], verdict: one.verdict, ignored: [...one.ignored] }
    : one;
}

function keptTakes(raw: unknown[] | undefined): Judged[] | undefined {
  if (raw === undefined) return undefined;
  const out: Judged[] = [];
  for (const one of raw) {
    if (one === null || typeof one !== 'object' || !('kind' in one) || !('scope' in one)) return undefined;
    const row = one as Judged & { readonly before?: readonly (readonly [string, string])[]; readonly after?: readonly (readonly [string, string])[]; readonly ignored?: readonly (readonly [string, number])[] };
    if (row.kind !== 'judged') { out.push(row); continue; }
    out.push({
      kind: 'judged', scope: row.scope, demand: row.demand, locations: row.locations,
      before: new Map(row.before), after: new Map(row.after), verdict: row.verdict, ignored: new Map(row.ignored), started: Date.now(),
    });
  }
  return out;
}
