#!/usr/bin/env node
import{evidenceLines}from'../render/view.ts';
import{isPublicationRegion,preservedPublication,isPreservedSource}from'../render/receipts.ts';
import{renderPublication}from'../render/view.ts';
import {hostOutput,hostArguments} from '../host/call-context.ts';
import {serveNativeCommands} from '../host/command-server.ts';
import {authenticatedStanding} from '../host/admitted-place.ts';
import {prepareNativeProbe} from '../host/native/probes.ts';
import {nativeAuthorityCardView} from '../host/native/authority-card-view.ts';
import {prepareNativeReadingIdentity,prepareNativeViewIdentity,prepareNativeViewIdentities,declaredReadingIdentityLimits} from '../host/reading-identity.ts';
import {nativeHostInstrument} from '../host/native-receiver.ts';
import {ownRoot,processOf} from '../observe/runner.ts';
import {BoundRefusal,describeRefusal,readRefusalCatalog,refusalRecord} from '../host/refusals.ts';
import {readFileSync as readCatalogFile} from 'node:fs';
import {sha256 as catalogDigest} from '../host/hash.ts';
import {printReleaseApproval} from './release-result.ts';
import {inspectReference} from '../host/reference.ts';
import {exportAuthenticatedReference} from '../host/reference-export.ts';
import {authenticatedReferenceSelected,openAuthenticatedReference} from '../host/reference-native.ts';
import {printActResult} from './act-result.ts';
import {printStandingResult} from './standing-result.ts';
import {withContentStore} from '../host/content-store.ts';
import {readOnly, withoutEffects} from '../host/read-only.ts';
import {layReleases} from '../host/release.ts';
import {resolveSources,resolveRequested} from '../host/source-content.ts';
import {cellsWithReceipts} from '../host/cell-receipts.ts';
import {topos_cells_view_renderCells as renderCells} from "../../vendor/library.js";
import {releasePolicyLines} from '../fold/release-policy.ts';
import {admittedObjects} from '../host/objects.ts';
import {objectFold,executeComputation} from '../engine/index.ts';
import {readingEnvironment} from '../host/reading-context.ts';
import {verifyBytes} from '../host/adapters/keys/ed25519.ts';
import {instrumentDigest} from '../fold/digests.ts';
import {topos_wire_authorityAtEpoch as authorityAtEpoch} from "../../vendor/library.js";
import {toposAt,contentAt} from '../host/selected-topos.ts';
import {foldObjectsWithWasm,usesWasmObject} from '../wasm/object.ts';
import {topos_wire_OBJECT_VIEW as OBJECT_VIEW} from "../../vendor/library.js";
import {topos_standing_toposStanding as toposStanding} from "../../vendor/library.js";
import {topos_wire_wireAt as wireAt,topos_wire_parse as parseWire} from "../../vendor/library.js";
import {lockStanding} from '../fold/keys.ts';
import {ownStore,ownLock} from '../observe/runner.ts';
import {signedOwnerLines} from './owner.ts';
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { eraOf, signaturesOf } from '../fold/digests.ts';
import { fullDigest as bootstrapDigest } from '../host/digest.ts';
import { topos_wire_canonical as canonical } from "../../vendor/library.js";
import { EXTENSION, LOCK, fieldOf, foldClaims, isWire, selfName } from '../fold/claims.ts';
import { observedClaims, readerRefusals } from '../fold/observed.ts';
import { rolesOf } from '../fold/roles.ts';
import { authorityFor, releaseSigner, rootSigner, writerFor } from '../fold/signers.ts';
import { land, ledgerLines, storeOf } from '../land/ledger.ts';
import { lockLines, releaseOf } from '../fold/keys.ts';
import { signConsentLot } from '../land/sign.ts';
import { signerFor,frameSignerFor } from '../host/signing.ts';
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
import { installActSignalHandler, underTheLock, underTheRegions, underRootAuthority } from '../land/act.ts';
import { ownerOf, renderInto, signedDemands, targetFile } from './owner.ts';
import { claimLinesIn, entryOf, namedPlaces, positionalIndexes, positionalsOf, valueOf } from './args.ts';
import { EXIT, FLAGS, NAMED_VIEWS, helpLines } from './names.ts';
import type { VerbName } from './names.ts';
import { accept, signedBatch } from './accept.ts';
import {renderWalk,landWalk,foreignWalkLines} from '../host/walk.ts';
import {topos_walk_isWalkHeader as isWalkHeader} from "../../vendor/library.js";
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
    if(error instanceof BoundRefusal)throw error;
    hostOutput('error',`${selfName()}: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT.refuse;
  }
  // Preflight above performs no writes. Only an admitted batch may establish its root of trust.
  return underTheLock(store, 'bootstrap', () => {
    if (ledgerLines(store, owner).length || observeText(targetFile(root)) !== proposed) {
      hostOutput('error',`${selfName()}: REFUSE·bootstrap the proposed lock or owner ledger changed before commit\n`);
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
    hostOutput('out',
      `FACT     landed ${landed.appended} unique lines from ${today.length} in TARGET`
      + ` · ${failing} of ${signedLines.length} signed lines fail admission by declared authority\n`
      + `TARGET   ${rendered.standing} claims · ${rendered.superseded.length} superseded · ${Date.now() - started} ms\n`,
    );
    for (const line of rendered.superseded) hostOutput('out',`SUPERSEDED ${line}\n`);
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
      hostOutput('out',`FACT     vouched · ${vouched} sources under ${locations.size} locations · ${refused.size} needs refused as globs\n`);
    }
    return EXIT.closed;
  });
}

/** What one fold cost, where it was taken and whether its points had already been folded: a beat of the instrument. */
function beat(root: string, fold: PlaceFold, ms: number): void {
  const folder = writerFor(fold.standing, 'fold');
  const seconds = (n: number): string => `${(n / 1000).toFixed(n < 100 ? 2 : 1)} s`;
  hostOutput('error',`BEAT     fold ${fold.key.slice(0, 8)} ${fold.kept ? 'kept' : 'folded'} ${seconds(ms)}`
    + `${fold.beats.kept ? ` · ${seconds(fold.beats.kept)} kept` : ''}${fold.beats.folded ? ` · ${seconds(fold.beats.folded)} folded` : ''}\n`);
  if (folder === undefined) return;
  if (!fold.kept) {
    const moved = movedPoints(storeOf(root), foldPoints(storeOf(root), fold.standing, fold.under, folder, fold.instrument), fold.key);
    const named = moved === undefined ? 'no fold was kept before this one'
      : `${moved.gone.length} points gone · ${moved.came.length} came · ${[...moved.gone, ...moved.came].slice(0, 3).map((one) => one.split(' ')[0]).join(' ') || 'none'}`;
    hostOutput('error',`KEPT     fold ${fold.key.slice(0, 8)} miss · ${named}\n`);
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
async function view(root: string, under: string | undefined, asked: string, told: readonly string[] = [], coord?: string, key?: string, includePolicy = true, authorityHeld = false): Promise<number> {
  const [name = asked, depth, expectedIdentity, ...extraSelection] = asked.split('@');
  if (name === NAMED_VIEWS.help) {
    hostOutput('out',`${helpLines().join('\n')}\n`);
    return EXIT.closed;
  }
  if(name==='authority-card'){
    if(under||told.length||coord||!depth||expectedIdentity!==undefined||extraSelection.length)throw new BoundRefusal('authority-card/selection','REFUSE·authority-card/selection requires one admitted request scope');
    const result=await nativeAuthorityCardView(root,nativeHostInstrument(ownRoot(),processOf('verb')),depth);
    if(result.kind==='refuse')throw new BoundRefusal(result.code,result.diagnostic);
    hostOutput('out',JSON.stringify(result)+'\n');return EXIT.closed;
  }
  if(name==='probe'){
    if(under||told.length||coord||!depth||extraSelection.length||expectedIdentity==='')throw new BoundRefusal('reading-identity/selection','REFUSE·probe requires one local native view');
    const limits=declaredReadingIdentityLimits(authenticatedStanding(root));
    const result=prepareNativeProbe({place:root,instrument:nativeHostInstrument(ownRoot(),processOf('verb')),view:depth,...(expectedIdentity?{expectedIdentity}:{}),port:{coordinate:'port/native-probe',probes:limits.probes,responseBytes:limits.bytes},counter:{used:new Map()}});
    if(result.kind==='refuse')throw new BoundRefusal(result.code,result.diagnostic);
    hostOutput('out',JSON.stringify(result)+'\n');return EXIT.closed;
  }
  if(name==='reading-identities'){
    if(under||told.length||coord||!depth||expectedIdentity!==undefined||extraSelection.length)throw new BoundRefusal('reading-identity/selection','REFUSE·native view identities require one local place and explicit views');
    const result=prepareNativeViewIdentities({place:root,instrument:nativeHostInstrument(ownRoot(),processOf('verb')),views:depth.split('+')});
    if(result.kind==='refuse')throw new BoundRefusal(result.code,result.diagnostic);
    hostOutput('out',JSON.stringify(result)+'\n');return EXIT.closed;
  }
  if(name==='reading-identity'&&depth!==undefined){
    if(under||told.length||coord||extraSelection.length||expectedIdentity==='')throw new BoundRefusal('reading-identity/selection','REFUSE·native view identity requires one local place and a declared selector');
    const result=prepareNativeViewIdentity({place:root,instrument:nativeHostInstrument(ownRoot(),processOf('verb')),view:depth,...(expectedIdentity?{expectedIdentity}:{})});
    if(result.kind==='refuse')throw new BoundRefusal(result.code,result.diagnostic);
    hostOutput('out',JSON.stringify(expectedIdentity===undefined?{kind:result.kind,view:result.view,identity:result.identity}:result)+'\n');return EXIT.closed;
  }
  if(name==='reading-identity'){
    if(under||told.length||coord||depth!==undefined)throw new BoundRefusal('host/context','REFUSE·reading identity requires one local admitted place');
    const limits=declaredReadingIdentityLimits(lockStanding(storeOf(root)));
    const result=await prepareNativeReadingIdentity({place:root,instrument:nativeHostInstrument(ownRoot(),processOf('verb')),limits});
    if(result.kind==='refuse')throw new BoundRefusal(result.code,result.diagnostic);
    hostOutput('out',JSON.stringify(result)+'\n');return EXIT.closed;
  }
  const publication=viewsOf(lockStanding(storeOf(root))).get(name);
  if(!under&&!told.length&&name==='evidence'&&isPreservedSource(root,storeOf(root))&&publication&&!publication.shape&&publication.regions.length&&publication.regions.every(region=>region.name==='evidence')){
   const text=withoutEffects(()=>evidenceLines(root,storeOf(root)).join('\n'));
   if(text)hostOutput('out',text+'\n');return EXIT.closed;
  }
  if(!under&&!told.length&&publication?.regions.length&&publication.regions.every(region=>isPublicationRegion(region.name))){
   const text=withoutEffects(()=>{const held=preservedPublication(root);return held?renderPublication(held,publication.regions):undefined});
   if(text!==undefined){hostOutput('out',text);return EXIT.closed;}
  }
  if(!readOnly()&&!told.length&&publication?.regions.some(region=>isPublicationRegion(region.name)))return withoutEffects(()=>view(root,under,asked,told,coord,key,includePolicy,authorityHeld));
  // A declared executable reader holds the acting Root's authority throughout
  // observation and publication. This predicate acquires exclusion only; the
  // native route authenticates the actual declaration before use.
  if (!authorityHeld && !told.length && !readOnly() && lockStanding(storeOf(root)).some(line=>
    /^reader\/.+\/port$/.test(fieldOf(line,'scope')) && fieldOf(line,'role')==='writes' && fieldOf(line,'value')!=='withdraw')) {
    return underRootAuthority(storeOf(root),'view reader authority',()=>view(root,under,asked,told,coord,key,includePolicy,true));
  }
  if (!lockLines(storeOf(root)).length) {
    hostOutput('error',`${selfName()}: the owner ledger is empty; land it before rendering a view\n`);
    return EXIT.refuse;
  }
  if(name==='act'){if(under||told.length)throw Error('REFUSE·act committed identity query only');printActResult(root,coord);return EXIT.closed;}
  if(name==='standing'){if(under||told.length||coord||depth!==undefined)throw new BoundRefusal('standing/query','REFUSE·standing local committed projection only');printStandingResult(root);return EXIT.closed;}
  if(name==='evidence'&&!under&&!told.length&&ingressBundles(storeOf(root)).length){
    const declared=viewsOf(lockStanding(storeOf(root))).get(name);
    if(!declared||declared.shape||!declared.regions.some(region=>region.name==='evidence'))throw Error('REFUSE·view foreign evidence requires a declared evidence view');
    const received=await foreignWalkLines(root),authority=authorityFor(lockLines(storeOf(root)),rootSigner(root),signaturesOf(storeOf(root)).admitted);
    const local=[...new Set(authority.admitted.flatMap(key=>ledgerLines(storeOf(root),key.id)))].filter(line=>authority.of(line).kind==='admitted');
    for(const line of [...new Set([...local,...ingressReceipts(storeOf(root)),...received])])hostOutput('out',line+'\n');
    hostOutput('out','FACT authenticated histories · readings · no encounters computed\n');
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
    hostOutput('out',text ? `${text}\n` : '');
    return EXIT.closed;
  }
  if (told.length) {
    const selected = viewsOf(standingOf(root, under, ledger).standing).get(name);
    if (selected && !selected.shape && selected.regions.some(region => region.name === 'cells')) {
      const history = [...signedOwnerLines(storeOf(root)), ...ledger];
      const held = await admittedObjects(root, history);
      hostOutput('out',`TOLD     ${told.length} lines folded as if landed · nothing written\n`);
      for (const line of renderCells(objectFold(held.records, held.context))) hostOutput('out',line + '\n');
      return EXIT.closed;
    }
  }
  const own = place ? rest.filter((line) => admittedIn(root, place, line)) : [];
  // Executed views use the place's declared mounts before observation, as pass
  // does. Prospective folds and public standing queries do not lay releases.
  if (!told.length && !readOnly()) layReleases(storeOf(root), root, standingOf(root, under).standing, storeOf(root));
  const publicationView=readOnly()&&viewsOf(lockStanding(storeOf(root))).get(name)?.regions.some(region=>isPublicationRegion(region.name));
  const fold = told.length||publicationView
    ? foldPlace(root, entryOf(root), under, false, { standing: standingOf(root, under, ledger), observed: observedClaims(root, storeOf(root), { wait: false }), free: told.length>0 })
    : foldPlace(root, entryOf(root), under, true);
  if (!told.length && readerRefusals().length) {
    for (const why of readerRefusals()) hostOutput('error',`${selfName()}: ${why}\n`);
    return EXIT.refuse;
  }
  if (coord) askWhy(fold, coord);
  if (name === NAMED_VIEWS.lines) {
    if (!told.length) beat(root, fold, Date.now() - at);
    const text = fold.standing.filter(isWire).join('\n');
    hostOutput('out',text ? `${text}\n` : '');
    if (depth === '1') for (const line of readingsIn([...fold.standing.filter(isCeiling), ...ownCeilings(under)], fold)) hostOutput('out',`${line}\n`);
    return EXIT.closed;
  }
  const views = viewsOf(fold.standing);
  const cellsView = [...views.entries()].find(([, one]) => !one.shape && one.regions.some((region) => region.name === 'cells'));
  if (cellsView && name === cellsView[0]) {
    const history=signedOwnerLines(storeOf(root));
    const {topos_wire_objectHistory:objectHistory}=await import("../../vendor/library.js");
    const parsed=objectHistory(history);
    if(parsed.kind!=='fact')throw Error(`REFUSE·wire ${parsed.why}`);
    if(parsed.value.objects.length){
      await cellsWithReceipts(root,history,text=>hostOutput('out',text+'\n'));
      if (includePolicy) for (const line of releasePolicyLines(fold.release)) hostOutput('out',line+'\n');
      if (!told.length) beat(root, fold, Date.now() - at);
      return EXIT.closed;
    }
    if (!told.length) beat(root, fold, Date.now() - at);
    const cells = fold.open ?? [];
    const mine = key ? cells.filter((cell) => cell.origins.includes(key)) : cells;
    const cards = openCards(mine);
    if (key) hostOutput('out',`KEY      ${key}\n`);
    if (cards.length) hostOutput('out',`${cards.join('\n')}\n`);
    return EXIT.closed;
  }
  if (!told.length&&!views.get(name)?.regions.some(region=>isPublicationRegion(region.name))) beat(root, fold, Date.now() - at);
  if (name === 'rank') {
    const asked = place ? [place] : placesIn(root);
    const reds = asked.flatMap((one) => sharedShapes(ownLockOf(root, one)).map((said) => `${one} ${said}`));
    if (reds.length) {
      hostOutput('error',`${selfName()}: REFUSE·rank ${reds.join(' · ')}: two views naming the same shape in one place\n`);
      return EXIT.refuse;
    }
  }
  const signed = views.get(name);
  if (!signed) {
    hostOutput('error',`${selfName()}: no view/${name} is signed; the lock signs ${[...views.keys()].sort().map((v) => `view/${v}`).join(' · ') || 'no view'}\n`);
    return EXIT.usage;
  }
  const missing = unrendered(fold, signed);
  if (missing.length) {
    hostOutput('error',`${selfName()}: REFUSE·view view/${name} asks regions nothing renders: ${missing.join(' ')} · none is the instrument's own and no capsule ${under ?? 'the root'} can run declares it\n`);
    return EXIT.refuse;
  }
  const bound = placesOf(fold.standing, signed);
  if (bound.length && !bound.includes(under ?? '')) {
    hostOutput('error',`${selfName()}: view/${name} writes ${bound.map((place) => `${place}${signed.shape}`).join(' · ')}, and nothing of ${under ?? 'this place'}\n`);
    return EXIT.usage;
  }
  const folder = writerFor(fold.standing, 'fold');
  if (folder !== undefined && !told.length && !readOnly()) {
    const spent = Date.now() - at;
    land(storeOf(root), folder, [canonical({
      scope: `beat/${under ?? '.'}`, role: 'writes', form: 'interval', measure: 'ms',
      value: `${spent}..${spent}`, by: folder, at: `place:command-${fold.kept ? 'kept' : 'folded'}`,
    })]);
  }
  const shown = (fold: PlaceFold): number | Promise<number> => {
  const text = viewOf(fold, Number.isFinite(Number(depth)) && depth !== undefined ? { ...signed, regions: signed.regions.map((one) => (one.called ? { ...one, at: Number(depth) } : one)) } : signed);
  if ((hostArguments()??process.argv).includes(FLAGS.check)) {
    const coordinate = join(root, under ?? '', signed.shape || '');
    const held = signed.shape ? observeText(coordinate) : undefined;
    const same = held !== undefined && held === text;
    if (same) {
      hostOutput('out',`SAME     ${signed.shape || `view/${name}`}\n`);
      return EXIT.closed;
    }
    const heldLines = (held ?? '').split('\n');
    const next = text.split('\n');
    const found = heldLines.findIndex((line, i) => line !== next[i]);
    const at = found < 0 ? Math.min(heldLines.length, next.length) : found;
    const line = (found < 0 ? next[at] : heldLines[at]) ?? next[at] ?? '';
    hostOutput('out',`DIFFERS     ${signed.shape || `view/${name}`}${held === undefined ? ' · this place holds no such region' : ` · line ${at + 1} · ${line}`}\n`);
    return EXIT.refuse;
  }
  if (!signed.shape || told.length) {
    if (told.length) {
      hostOutput('out',`TOLD     ${told.length} lines folded as if landed · ${ledger.length} in the ledger · ${own.length} in ${place ?? 'the root'}'s own lock`
        + `${rest.length - own.length ? ` · ${rest.length - own.length} admitted nowhere` : ''} · the batch lands nothing and nothing is written\n`);
    }
    hostOutput('out',text);
    if (depth === '1') for (const line of readingsIn(told.length ? told.filter(isCeiling) : [...fold.standing.filter(isCeiling), ...ownCeilings(under)], fold)) hostOutput('out',`${line}\n`);
    return EXIT.closed;
  }
  const coordinate = join(root, under ?? '', signed.shape);
  return underTheRegions(storeOf(root), [under ?? ''], `view/${name}`, () => {
    mkdirSync(dirname(coordinate), { recursive: true });
    writeFileSync(coordinate, text);
    hostOutput('out',`RENDERED ${relative(root, coordinate).split(sep).join('/')} · view/${name} · ${text.split('\n').length - 1} lines\n`);
    return EXIT.closed;
  });
  };
  return shown(fold);
}

async function signVerb(root: string, rest: readonly string[]): Promise<number> {
  const as=valueOf(rest,FLAGS.as);
  if(as!==undefined){
    const sources=positionalsOf(rest);
    if(as!=='reference'||sources.length!==1||rest.includes(FLAGS.check))throw new BoundRefusal('reference-export/usage','REFUSE·reference-export usage: sign --as reference <source-url>');
    const result=await exportAuthenticatedReference(root,sources[0]!,{key:valueOf(rest,FLAGS.key),keyFile:valueOf(rest,FLAGS.keyFile),signer:valueOf(rest,FLAGS.signer)});
    hostOutput('out',JSON.stringify(result)+'\n');return EXIT.closed;
  }
  const batch = await signedBatch(root, rest, positionalsOf(rest));
  if (batch.kind === 'exit') return batch.code;
  if (batch.kind === 'once') {
    hostOutput('error',`ONCE     ${batch.proposed.length} lines · every one already landed: nothing to sign\n`);
    return EXIT.closed;
  }
  for (const place of namedPlaces(rest)) hostOutput('out',`# place ${place}\n`);
  for (const line of batch.signed) hostOutput('out',`${line}\n`);
  hostOutput('error',`SIGNED   ${batch.signed.length} lines · epoch ${batch.epoch}${namedPlaces(rest).length ? ` · own lines for ${namedPlaces(rest).join(', ')}` : ''} · they land together, before the lock moves\n`);
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
      hostOutput('error',`${selfName()}: REFUSE·bootstrap the owner ledger already holds claims; provide an explicit signed batch to change it\n`);
      return EXIT.refuse;
    }
    return firstLand(root, rest);
  }
  try {
    const proposed=batch.flatMap(claimLinesIn);
    if(proposed.some(isWalkHeader)){
      for(const line of await landWalk(root,proposed,valueOf(rest,FLAGS.key),valueOf(rest,FLAGS.keyFile),valueOf(rest,FLAGS.signer)))hostOutput('out',line+'\n');
      return EXIT.closed;
    }
    return await accept(root, rest);
  } catch (error) {
    if(error instanceof BoundRefusal)throw error;
    const message = error instanceof Error ? error.message : String(error);
    hostOutput('error',`${selfName()}: ${message.startsWith('REFUSE·') ? message : `REFUSE·crash ${message}`}\n`);
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
    hostOutput('out',selected.split('\n').filter(Boolean).map(line=>'TOPOS '+line).join('\n')+'\n');
    hostOutput('out','PIN '+bootstrapDigest([selected],algorithm)+'\n');
  }
  for (const line of folded.standing) hostOutput('out',`${line}\n`);
  for (const fork of folded.forks) hostOutput('out',`FORK     ${fork.key}${fork.state ? ` · ${fork.state}` : ''}\n`);
  hostOutput('out',`FACT     ${folded.standing.length} standing · ${folded.forks.length} forks · ${basename(at)} · readings · no encounters computed\n`);
  return EXIT.closed;
}

function foldVerb(root: string, rest: readonly string[]): number | Promise<number> {
  const references = positionalsOf(rest).filter(one => /^#(?:bound|topos-reference)(?::|$)/.test(one));
  if (references.length) {
    if (references.length !== 1 || positionalsOf(rest).length !== 1 || rest.some(one => one.startsWith('--')))
      throw Error('REFUSE·reference name one reference without view, check or signing options');
    if(authenticatedReferenceSelected(standingOf(root).standing)){
      if(references[0]!.startsWith('#topos-reference:'))throw Error('REFUSE·reference located profile is inspection only; authenticated opening requires its declared carrier');
      return openAuthenticatedReference(root,references[0]!).then(result=>{
      hostOutput('out',`SOURCE   ${result.reference.source}\n`);
      for(const line of result.semanticStanding.split('\n').filter(Boolean))hostOutput('out',`TOPOS ${line}\n`);
      for(const cell of result.readings)hostOutput('out','CELL '+JSON.stringify(cell)+'\n');
      hostOutput('out',`AUTHENTICATED standing ${result.semanticIdentity} · authority ${result.authorityContextIdentity} · no effects committed\n`);
      return EXIT.closed;
      });
    }
    return inspectReference(references[0]!, standingOf(root).standing).then(result => {
      const source='source' in result.reference?result.reference.source:result.reference.location;
      if(source)hostOutput('out',`SOURCE   ${source}\n`);
      if('needs' in result){hostOutput('out',`NEEDS    ${result.needs} · unauthenticated inspection\n`);return EXIT.closed;}
      for (const line of result.lines) hostOutput('out',`TOPOS ${line}\n`);
      hostOutput('out',`INSPECT  standing sha256:${result.reference.digest} · blob ${result.reference.blob} · no encounters computed · unauthenticated\n`);
      return EXIT.closed;
    });
  }
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
  if(['reading-identity','reading-identities','probe','authority-card'].includes(as?.split('@')[0]??'')&&(prospective||under||argv.includes(FLAGS.check)))throw new BoundRefusal('reading-identity/selection','REFUSE·reading-identity/selection preparation does not sign batches or check rendered output');
  if(['reading-identity','reading-identities','probe','authority-card'].includes(as?.split('@')[0]??'')||as==='release'||as?.split('@')[0]==='act'||as===NAMED_VIEWS.help || prospective || argv.includes(FLAGS.check))return foldResolved(root,under,argv);
  return resolveRequested(digest=>resolveSources(standingOf(root,under).standing,[digest]),()=>foldResolved(root,under,argv));
}

async function foldResolved(root: string, under: string | undefined, argv: readonly string[]): Promise<number> {
  const as = valueOf(argv, FLAGS.as);
  if(as==='release'){
    const approvals=positionalsOf(argv).filter(one=>!(existsSync(resolve(one))&&lstatSync(resolve(one)).isDirectory()));
    if(approvals.length!==1||argv.includes(FLAGS.check))throw Error('REFUSE·release name one approval file; check does not authorize delivery');
    return withoutEffects(()=>{printReleaseApproval(under?resolve(root,under):root,resolve(approvals[0]!));return EXIT.closed;});
  }
  const inputs = positionalsOf(argv).filter(one => existsSync(resolve(one)) && !lstatSync(resolve(one)).isDirectory());
  // Public content is authenticated by its digest, independently of owner history.
  // A named view does not request mounting every release of the instrument.
  const receiptCheck = as === undefined && argv.includes(FLAGS.check);

  if(as?.split('@')[0]==='walk'){
    if(argv.includes(FLAGS.check))throw Error('REFUSE·walk check does not initiate or sign an exchange');
    if(under||inputs.length>1)throw Error('REFUSE·walk one place and one authenticated peer inventory per fold');
    const depth=as.split('@')[1];if(depth!==undefined&&(!/^(0|[1-9][0-9]*)$/.test(depth)||!Number.isSafeInteger(Number(depth))))throw Error('REFUSE·walk invalid resolution');
    const peer=inputs.length?claimLinesIn(inputs[0]!):[];
    for(const line of await renderWalk(root,depth===undefined?undefined:Number(depth),peer,valueOf(argv,FLAGS.key),valueOf(argv,FLAGS.keyFile),valueOf(argv,FLAGS.signer)))hostOutput('out',line+'\n');
    return EXIT.closed;
  }

  if(as===OBJECT_VIEW||as==='computation'){
    const inputs=positionalsOf(argv).filter(one=>existsSync(resolve(one))&&!lstatSync(resolve(one)).isDirectory());
    if(inputs.length>1)throw Error('REFUSE·object one history snapshot per fold');
    const history=inputs.length?claimLinesIn(inputs[0]!):signedOwnerLines(storeOf(root));
    const held=await admittedObjects(root,history,text=>(as==='computation'?process.stderr:process.stdout).write(text+'\n'));
    const project=async()=>{if(usesWasmObject(held.configuration)){
      const cancellation=new AbortController(),interrupt=()=>cancellation.abort();
      process.once('SIGINT',interrupt);
      try{return await foldObjectsWithWasm(root,held.records,held.context,held.configuration,cancellation.signal);}
      finally{process.removeListener('SIGINT',interrupt);}
    }return objectFold(held.records,held.context)};
    if(as==='computation'){
      if(under||argv.includes(FLAGS.check))throw new BoundRefusal('computation/context','REFUSE·computation/context');
      const one=(scope:string)=>{const rows=held.configuration.filter(f=>f.scope===scope&&f.value!=='withdraw');if(rows.length!==1)throw new BoundRefusal('computation/context','REFUSE·computation/context');return rows[0]!.value!};
      if(one('view/computation')!=='computation@1')throw new BoundRefusal('computation/context','REFUSE·computation/context');
      const resource=(scope:string)=>{const span=/^0\.\.([1-9][0-9]*)$/.exec(one(scope)),n=Number(span?.[1]);if(!span||!Number.isSafeInteger(n))throw new BoundRefusal('computation/budget','REFUSE·computation/budget');return n};
      const key=valueOf(argv,FLAGS.key),era=signaturesOf(storeOf(root)),authority=authorityFor(history,rootSigner(root),era.admitted),signer=authority.admitted.find(s=>s.id===key),epoch=Math.max(...history.map(l=>Number(fieldOf(l,'epoch')||0)));
      if(!key||!signer||authorityAtEpoch({scope:'computation',by:key},signer,epoch,'computation','authority').kind!=='admitted')throw new BoundRefusal('computation/authority','REFUSE·computation/authority');
      const input=new TextEncoder().encode(history.join('\n')+'\n'),policy=catalogDigest(held.configuration.map(f=>canonical(f)).join('\n')),references=new Map<string,string>();
      for(const pin of new Set(held.records.filter(r=>r.record==='cell').map(r=>r.fields.topos!))){
        references.set('form/'+pin,pin);const selected=toposAt(pin),view=selected.parts.find(f=>f.scope==='wire/topos/context-view')?.value;
        for(const offer of selected.parts.filter(f=>f.kind==='check'&&f.view===view))for(const dependency of (offer.restsOn??'').split('|').filter(Boolean)){contentAt(dependency);references.set('form-module/'+dependency,dependency)}
      }
      const engine=instrumentDigest(ownStore(),processOf('verb'),ownLock(),ownRoot()),assets=usesWasmObject(held.configuration)?['manifest.json','runtime.js','runtime.wasm','guest.js'].map(name=>[name,catalogDigest(readCatalogFile(new URL('../../assets/wasm/'+name,import.meta.url)))]):[],implementation=assets.length?catalogDigest(JSON.stringify([engine,assets])):engine;
      const invoke=frameSignerFor(held.configuration.map(f=>canonical(f)),key,valueOf(argv,FLAGS.signer),valueOf(argv,FLAGS.keyFile)),limits={maxBytes:resource('computation/bytes'),timeoutMs:resource('computation/milliseconds')};
      const context={contract:one('computation/contract'),numericPolicy:one('computation/numeric-policy'),reading:{instrument:engine,implementation,policy,inputs:[...references],environment:readingEnvironment(catalogDigest)},keyId:key,algorithm:era.era};
      const result=await executeComputation(context,input,{digest:catalogDigest,evaluate:async()=>new TextEncoder().encode(JSON.stringify(await project())+'\n'),sign:invoke,verify:async(bytes,signature,algorithm)=>signature.keyId===key&&verifyBytes(bytes,signer.publicKey,signature.signature,[algorithm])},limits);
      hostOutput('out',JSON.stringify({profile:'bound-computation-delivery@1',context,input:new TextDecoder().decode(input),statement:result.statement,output:new TextDecoder().decode(result.output)})+'\n');return EXIT.closed;
    }
    const cells=await project();
    for(const cell of cells)hostOutput('out','CELL '+JSON.stringify(cell)+'\n');
    hostOutput('out',`FACT     object fold ${cells.length} cells\n`);
    return EXIT.closed;
  }
  const key = valueOf(argv, FLAGS.key);
  if (as === undefined) {
    const exit=await pass(root, entryOf(root), under, argv.includes(FLAGS.check));
    if (receiptCheck) return exit;
    if(exit!==0)return exit;
    const history=signedOwnerLines(storeOf(root));
    const {topos_wire_objectHistory:objectHistory}=await import("../../vendor/library.js");
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
  if(as==='act'){if(positionalsOf(argv).length!==1)throw Error('REFUSE·act name one committed identity');return view(root,under,as,[],coord);}
  if ((as === 'why' || as === NAMED_VIEWS.because || as.split('@')[0] === 'why') && coord !== undefined) return view(root, under, as === NAMED_VIEWS.because ? 'why' : as, [], coord, key);
  if (!named.length) return view(root, under, as, [], undefined, key);
  const batch = await signedBatch(root, argv, named);
  if (batch.kind === 'exit') return batch.code;
  if (batch.kind === 'once') hostOutput('out',`ONCE     ${batch.proposed.length} lines · every one already landed: the view folds the tree as it stands\n`);
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
      hostOutput('error',`${selfName()}: REFUSE·flag unknown option ${arg}\n`);
      return EXIT.usage;
    }
    if (arg !== FLAGS.check) {
      if (argv[i + 1] === undefined || argv[i + 1]!.startsWith('--')) {
        hostOutput('error',`${selfName()}: REFUSE·flag ${arg} needs a value\n`);
        return EXIT.usage;
      }
      i += 1;
    }
  }
  const verb = argv[0] ?? '';
  const run = verb in VERBS ? VERBS[verb as VerbName] : undefined;
  const places = positionalsOf(run === undefined ? argv : argv.slice(1)).filter((one) => existsSync(resolve(one)) && lstatSync(resolve(one)).isDirectory());
  if (run !== undefined) {
    const rest = argv.slice(1);
    const roots = positionalIndexes(rest).filter(index => {
      const path = resolve(rest[index]!);
      return existsSync(path) && lstatSync(path).isDirectory();
    });
    if (roots.length > 1) {
      hostOutput('error',`${selfName()}: REFUSE·root name one acting directory\n`);
      return EXIT.usage;
    }
    const selected = roots[0];
    const root = resolve(selected === undefined ? '.' : rest[selected]!);
    const normalized = selected === undefined ? rest : rest.filter((_, index) => index !== selected);
    return withContentStore(storeOf(root), () =>
      verb === 'fold' && selected !== undefined && !positionalsOf(normalized).some(one => /^#(?:bound|topos-reference)(?::|$)/.test(one))
        ? foldAt(root, undefined, normalized)
        : run(root, normalized, [verb, ...normalized]), () => standingOf(root).standing);
  }
  const under = argv[0] ?? '';
  if (under && !under.startsWith('-') && places.includes(under)) {
    const root = resolve('.');
    const place = relative(root, resolve(under)).split(sep).join('/');
    return foldAt(root, place ? `${place}/` : undefined, argv);
  }
  hostOutput('error',`${selfName()}: ${helpLines().join(' · ')}\n`);
  return EXIT.usage;
}

function printRefusal(error:BoundRefusal):void {
 let text='';try{text=readCatalogFile(new URL('../../docs/contracts/refusals.bound',import.meta.url),'utf8')}catch{}
 hostOutput('error',JSON.stringify(refusalRecord(error,text,catalogDigest))+'\n');
}
// Legacy numeric refusals receive a generic code by exit result, never by parsing
// a diagnostic. Specific causes retain their own typed code in the error path.
function completed(code:number):number {
 if(code===EXIT.refuse||code===EXIT.usage)printRefusal(new BoundRefusal(code===EXIT.usage?'operation/usage':'operation/failed',''));
 return code;
}
/** Both transports use this dispatcher and the same refusal catalog. No process
 * lifecycle, output replacement or argument mutation belongs to a request. */
async function runNativeCommand(argv:readonly string[]):Promise<number>{
 try{return completed(await main(argv))}
 catch(error){
  const message=error instanceof Error?error.message:String(error);
  hostOutput('error',`${selfName()}: ${message.startsWith('REFUSE·')?message:`REFUSE·crash ${message}`}\n`);
  printRefusal(error instanceof BoundRefusal?error:new BoundRefusal('operation/failed',message));
  return EXIT.refuse;
 }
}
if(process.send&&process.argv.length===2){serveNativeCommands(runNativeCommand)}
else{
 installActSignalHandler();
 void runNativeCommand(process.argv.slice(2)).then(code=>{process.exitCode=code});
}
