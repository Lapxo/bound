import {readingWitnessAdmission} from '../host/native/reading-witness-admission.ts';
import {BoundRefusal} from '../host/refusals.ts';
import {assertHostNotCancelled as notCancelled} from '../host/host-controls.ts';
import {authorityAtEpoch} from '@lapxo/topos/wire';
import type {SigningPort} from '../engine/ports.ts';
import type {LocalActBundle} from '../host/ports/local-act.ts';
import type {PublicationStorage} from '../host/ports/publication.ts';
import {requireEffects} from '../host/read-only.ts';
import {hostOutput} from '../host/call-context.ts';
import {assertProspectiveRootClockSelection} from '../host/root-clock-source.ts';
import {hasContextualPlace,landContextualPlace} from '../host/contextual-place.ts';
import {commitLocalAct,intactLocalAct,committedLocalActs} from '../host/ports/local-act.ts';
import {withoutEffects} from '../host/read-only.ts';
import {admittedLine} from '../host/selected-topos.ts';
import { timing } from '../host/timing.ts';
import {admittedObjects} from '../host/objects.ts';
import { existsSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { closeReceipts, instrumentKeep, instrumentKept } from '../fold/closed.ts';
import { bytesDigest, fullDigest, instrumentOf, signaturesOf } from '../fold/digests.ts';
import { canonical, LOCK, parse, actIdentity, actResultProfile } from '@lapxo/topos/wire';
import { fieldOf, isConfig, foldClaims, sayingOf, selfName } from '../fold/claims.ts';
import { isReaderLock } from '../fold/observed.ts';
import { authorityFor, publicKeyOf, rootSigner, writerFor } from '../fold/signers.ts';
import { lockLines, lockStanding } from '../fold/keys.ts';
import { keepVerdict, keptVerdict, land, landBlob, ledgerLines, storeOf } from '../land/ledger.ts';
import { signConsentLot, verifiesOwnerLine } from '../land/sign.ts';
import { signerFor, assertNativeSigner } from '../host/signing.ts';
import { appliedIn, ownLockOf, ownRecordCovered, withOwnPreview } from '../fold/signed.ts';
import { wordOf } from '../fold/wire.ts';
import { hasVouchedTree, landCoordinates, locationsOf, vouchedCoordinates } from '../land/vouched.ts';
import { entriesIn, observeFile, observeText } from '../observe/files.ts';
import { coneOf, standingOf } from './place.ts';
import { ownLock, ownRoot } from '../observe/runner.ts';
import { widenedWithoutWitness } from '../judge/widening.ts';
import { retractedTogether, withdrawal } from '../land/withdraw.ts';
import { isCeiling } from '../fold/configures.ts';
import { inertIn } from '../land/inert.ts';
import { landSaid } from './pass.ts';
import { currentActSignal, underTheLock, underTheRegions, underAuthorityRegions, underRootProjection, underRootAuthority } from '../land/act.ts';
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
import { admitStandingPins } from '../land/standing-pin.ts';
import { coordinatesWithdrawn } from '../land/leaving.ts';
import { ownerOf, epochOf, localActLines, forksItself, forksJoinedBy, renderInto, sideOf, signedDemands, signedOwnerLines } from './owner.ts';
import { claimLinesIn, entryOf, namedPlaces, placesOfFile, positionalsOf, valueOf } from './args.ts';
import { FLAGS } from './names.ts';
import { judgeDemand, landTake } from './takes.ts';
import type { Judged } from './takes.ts';

/** Explicit data input to the same native admission path. Not CLI arguments or
 * offered host capabilities. The initial host operation admits Root lots only. */
export interface RootAdmissionHost {
 readonly records:readonly string[];
 readonly keyId:string;
 readonly signer:{readonly name:string;readonly sign:SigningPort;readonly signal?:AbortSignal};
 readonly signal?:AbortSignal;
 readonly storage?:PublicationStorage;
 readonly prepared?:(identity:string)=>void;
 readonly committed?:(identity:string,bundle:LocalActBundle,kind:'landed'|'once')=>void;
}
export type Batch = { readonly kind: 'signed'; readonly signed: readonly string[]; readonly records?:readonly string[]; readonly epoch: number; readonly base: { readonly digest: string; readonly places: readonly string[] }; readonly keyId?: string } | { readonly kind: 'once'; readonly proposed: readonly string[] } | { readonly kind: 'exit'; readonly code: number };

/** Admission reads an existing evidence snapshot; acquiring observations belongs to fold. */
export function admissionEvidence(root: string, signed: readonly string[], standing: readonly string[], now: number) {
  if(!Number.isSafeInteger(now))throw new BoundRefusal('admission/clock','REFUSE·admission clock is required');
  return withoutEffects(() => {
    const store = storeOf(root);
    assertProspectiveRootClockSelection(root,signed);
    const reads = !signed.some(isReaderLock) && signed.some(isCeiling);
    const fold = reads ? coneOf(root, entryOf(root), signed.filter(isCeiling)) : { standing, observed: [], own: {}, kept: true };
    const inert = inertIn(signed, { standing: fold.standing, ceiling: isCeiling, signsReader: !reads, observed: fold.observed, own: fold.own, epoch: epochOf([...lockLines(store), ...signed]) });
    if (inert.length) throw new BoundRefusal('admission/inert','REFUSE·inert no existing reading meets these ceilings; fold the declared inputs first');
    const coordinates = coordinatesWithdrawn(root, store, signed, [...signed, ...standing]);
    if (coordinates.refused.length) throw new BoundRefusal('admission/withdraw',`REFUSE·withdraw a file is still read: ${coordinates.refused.map(one => `${one.path} by ${one.by}`).join(' · ')}`);
    const view = `${wordOf(lockStanding(store), 'families', 'view')}/`;
    const judged: Judged[] = signed.filter(one => isConfig(one) && fieldOf(one, 'role') === 'demands' && fieldOf(one, 'value') !== 'withdraw' && !fieldOf(one, 'scope').startsWith(view)).map(one => {
      const scope = fieldOf(one, 'scope');
      const alreadyDemanded = standing.some(held => isConfig(held) && fieldOf(held, 'role') === 'demands'
        && fieldOf(held, 'value') !== 'withdraw' && fieldOf(held, 'scope') === scope
        && fieldOf(held, 'form') === fieldOf(one, 'form') && fieldOf(held, 'measure') === fieldOf(one, 'measure'));
      // Declaring an obligation is not a claim to have discharged it.
      return alreadyDemanded ? judgeDemand(root, one, {now})
        : {kind: 'owed', scope, why: 'new demand declared; no conformance reading is claimed'};
    });
    const refused = judged.filter(one => one.kind === 'refused' || (one.kind === 'judged' && one.verdict.kind === 'refuse'));
    if (refused.length) throw new BoundRefusal('admission/takes',`REFUSE·takes ${refused.map(one => `${one.scope}: ${one.kind === 'judged' ? one.verdict.why : one.kind === 'refused' ? one.why : ''}`).join(' · ')}`);
    return { coordinates, judged, fold };
  });
}

export type AdmissionEvidenceResult=
 |{readonly kind:'fact';readonly evidence:ReturnType<typeof admissionEvidence>}
 |{readonly kind:'refuse';readonly code:string;readonly diagnostic:string};
export function admissionEvidenceResult(root:string,signed:readonly string[],standing:readonly string[],now:number):AdmissionEvidenceResult {
 try{return {kind:'fact',evidence:admissionEvidence(root,signed,standing,now)}}
 catch(error){return {kind:'refuse',code:error instanceof BoundRefusal?error.code:'admission/evidence',diagnostic:error instanceof Error?error.message:String(error)}}
}

/** The same signed-lot epoch check used before native admission. */
export function configurationEpochCheck(proposed:readonly string[],epoch:number,held:(line:string)=>boolean):readonly string[] {
 return proposed.every(held)?[]:proposed.filter(line=>fieldOf(line,'sig')&&isConfig(line)&&Number(fieldOf(line,'epoch'))!==epoch);
}

/** Shared wire, pin, withdrawal and placement checks for a named configuration lot. */
export function configurationAdmissionGuards(root:string,signed:readonly string[],named:readonly string[]=[],placedAt?:(line:string)=>readonly string[]|undefined):
 {readonly kind:'fact';readonly ownership:Owned}|{readonly kind:'refuse';readonly code:string;readonly evidence:readonly unknown[];readonly diagnostic:string} {
 const store=storeOf(root),history=signedOwnerLines(store),standing=foldClaims(history).standing;
 const wireLines=[...history,...signed].flatMap(line=>{const got=parse(line);return got.kind==='fact'?[got.value.fields]:[]});
 for(const line of signed){const got=admittedLine(line,wireLines,Number(fieldOf(line,'epoch')),standing.filter(one=>fieldOf(one,'scope').startsWith('uses/')&&fieldOf(one,'value')!=='withdraw'));if(got.kind!=='fact')return {kind:'refuse',code:'wire',evidence:[line,got],diagnostic:got.why};}
 try{admitStandingPins(root,signed)}catch(error){return {kind:'refuse',code:'standing-pin',evidence:signed,diagnostic:error instanceof Error?error.message:String(error)}}
 const taken=retractedTogether(signed);if(taken.length)return {kind:'refuse',code:'withdraw',evidence:taken,diagnostic:'a withdrawal takes a new line in the same batch'};
 const authority=authorityFor([...lockLines(store),...signed],rootSigner(root),signaturesOf(store).admitted);
 const ownership=withOwnPreview(root,()=>ownedOf(root,signed,line=>authority.of(line).kind==='admitted',by=>authority.admitted.find(one=>one.id===by)?.coverage??[],named,placedAt));
 if(ownership.nowhere.length)return {kind:'refuse',code:'signer',evidence:ownership.nowhere,diagnostic:'the requested records are not covered at their selected destination'};
 if(ownership.forked.length)return {kind:'refuse',code:'forked',evidence:ownership.forked,diagnostic:'the lot would fork a selected own lock'};
 return {kind:'fact',ownership};
}

/** Structured admission checks shared by the native view and the act. */
export type AdmissionCheck =
 | {readonly kind:'fact';readonly evidence?:readonly string[]}
 | {readonly kind:'ask';readonly code:'widening'|'reading-witness';readonly evidence:readonly string[];readonly needs:readonly string[]}
 | {readonly kind:'refuse';readonly code:'outside'|'fork'|'alias'|'reading-witness';readonly evidence:readonly unknown[];readonly diagnostic:string};
export function admissionWideningChecks(root:string,signed:readonly string[],standing:readonly string[],vocabulary:readonly string[]=standing,place:string='.'):AdmissionCheck {
 const physical=readingWitnessAdmission(root,signed,standing,vocabulary,place);
 if(physical.kind==='ask')return physical;
 if(physical.kind==='refuse')return {kind:'refuse',code:physical.code,evidence:physical.evidence,diagnostic:physical.why};
 const widened=widenedWithoutWitness(signed,standing,isCeiling,wordOf(vocabulary,'at-classes','witness'));
 if(widened.length)return {kind:'ask',code:'widening',evidence:widened,needs:widened.map(line=>'witness:'+fieldOf(line,'scope'))};
 return {kind:'fact',evidence:physical.evidence};
}
export function admissionChecks(root:string,signed:readonly string[],standing:readonly string[]):AdmissionCheck {
 const widening=admissionWideningChecks(root,signed,standing);if(widening.kind!=='fact')return widening;
 const store=storeOf(root),outside=outsideTheirCapsule(root,standing,signed);
 if(outside.length)return {kind:'refuse',code:'outside',evidence:outside,diagnostic:'a reader or capsule lands in its own world'};
 const forks=forksJoinedBy(store,signed).filter(fork=>forksItself(fork.lines)||fork.lines.filter(line=>signed.includes(line)).length>1);
 if(forks.length)return {kind:'refuse',code:'fork',evidence:forks,diagnostic:'one signer and one act cannot fork themselves'};
 const aliases=aliasPinned(root,signed);
 if(aliases.length)return {kind:'refuse',code:'alias',evidence:aliases,diagnostic:'an alias is still named by a pin'};
 return {kind:'fact',evidence:widening.evidence};
}
/** Presentation consumes the same structured verdict as the native card. */
function refusesAdmission(root:string,signed:readonly string[],standing:readonly string[]):boolean {
 const result=admissionChecks(root,signed,standing);if(result.kind==='fact')return false;
 if(result.kind==='ask'&&result.code==='reading-witness'){hostOutput('error',`${selfName()}: REFUSE·reading-witness ${result.needs.join(' · ')} · nothing landed\n`);}
 else if(result.kind==='ask'){
  for(const line of result.evidence)hostOutput('error',`WIDER    ${fieldOf(line,'scope')} · ${fieldOf(line,'value')}\n`);
  hostOutput('error',`${selfName()}: REFUSE·widening nothing landed · a ceiling that admits more than it did gives back freedom the lock had spent: sign it under a witness that names what made the old ceiling wrong\n`);
 }else hostOutput('error',`${selfName()}: REFUSE·${result.code} nothing landed · ${result.diagnostic}\n`);
 return true;
}

function refusesStandingPins(root:string, lines:readonly string[]):boolean {
  try {admitStandingPins(root,lines);return false;}
  catch(error){hostOutput('error',`${selfName()}: ${error instanceof Error?error.message:String(error)}\n`);return true;}
}

/** A batch signed as accept signs it: at the next epoch, by the key it names, each line read by the wire it would land under. */
export async function signedBatch(root: string, args: readonly string[], files: readonly string[], host?:RootAdmissionHost): Promise<Batch> {
  const byFile = host?[[[] as readonly string[],host.records] as const]:files.map((file) => [placesOfFile(file), claimLinesIn(file)] as const);
  const proposed = byFile.flatMap(([, lines]) => lines);
  if (!proposed.length) {
    hostOutput('error',`${selfName()}: a batch is a file with claim lines\n`);
    return { kind: 'exit', code: 2 };
  }
  const drafted = proposed.filter((line) => !fieldOf(line, 'sig'));
  const bare = drafted.filter((line) => fieldOf(line, 'epoch') || !['', 'target'].includes(fieldOf(line, 'by')));
  if (bare.length) {
    for (const line of bare) hostOutput('error',`BARE     ${fieldOf(line, 'scope')} · by=${fieldOf(line, 'by') || '∅'}${fieldOf(line, 'epoch') ? ` epoch=${fieldOf(line, 'epoch')}` : ''}\n`);
    hostOutput('error',`${selfName()}: REFUSE·bare nothing landed · ${bare.length} lines name a signer or an epoch they were not signed with: a drafted line proposes by=target and sign signs it, a line a lane signed carries its sig\n`);
    return { kind: 'exit', code: 1 };
  }
  const store = storeOf(root);
  const destinations = [...new Set([...namedPlaces(args), ...byFile.flatMap(([heads]) => heads)])];
  const rooted = lockStanding(store);
  const stray = destinations.filter(one => !placesIn(root).includes(one) && !foundableIn(root, rooted, wordOf(rooted, 'families', 'region'), one));
  if (stray.length) {
    hostOutput('error',`${selfName()}: REFUSE·place nothing landed · ${stray.join(', ')} is no place of the tree, and no line of the root founds it: --place names the own lock a line lands in\n`);
    return {kind:'exit',code:2};
  }
  const local = localActLines(root, destinations);
  const base = { digest: fullDigest(store, local), places: destinations };
  const epoch = epochOf(local) + 1;
  const stale = proposed.filter((line) => fieldOf(line, 'sig')).flatMap((line) => ((by, key) => (key === undefined || !verifiesOwnerLine(line, key, signaturesOf(store).admitted)
    ? [`${fieldOf(line, 'scope')} · the signature does not hold for ${by || '∅'}`]
    : []))(fieldOf(line, 'by'), publicKeyOf(root, fieldOf(line, 'by'))));
  if (stale.length) {
    for (const one of stale) hostOutput('error',`SIGNED   ${one}\n`);
    hostOutput('error',`${selfName()}: REFUSE·signed nothing landed · ${stale.length} lines a lane signed stand at no epoch this act\n`);
    return { kind: 'exit', code: 1 };
  }
  const [named, places] = [namedPlaces(args), placesIn(root)];
  const inLock = new Set(lockLines(store).map(sayingOf));
  const inPlace = new Map(places.map((place) => [place, new Set(appliedIn(root, place).map(sayingOf))] as const));
  const deliveryAuthority = authorityFor(lockLines(store), rootSigner(root), signaturesOf(store).admitted);
  const delivered = (line: string): boolean => Boolean(fieldOf(line, 'sig'))
    && deliveryAuthority.of(line).kind === 'admitted'
    && ledgerLines(store, fieldOf(line, 'by')).includes(line);
  const held = (line: string, at = named.length ? named : byFile.flatMap(([heads, lines]) => (lines.includes(line) ? heads : []))): boolean => at.length
    ? at.every((place) => inPlace.get(place)?.has(sayingOf(line)))
    : delivered(line) || inLock.has(sayingOf(line)) || places.some((place) => inPlace.get(place)?.has(sayingOf(line)));
  if (proposed.every((line) => held(line))) {
    if(proposed.some(line=>!isConfig(line))) {try {await admittedObjects(root,[...signedOwnerLines(store),...proposed]);}catch(e){hostOutput('error',`${selfName()}: ${String(e)} · nothing landed\n`);return {kind:'exit',code:1};}}
    return { kind: 'once', proposed };
  }
  const outdated = configurationEpochCheck(proposed,epoch,held);
  if (outdated.length) {
    for (const line of outdated) hostOutput('error',`SIGNED   ${fieldOf(line, 'scope')} · signed by ${fieldOf(line, 'by')} at epoch ${fieldOf(line, 'epoch')}, and this act lands at ${epoch}: sign it again\n`);
    hostOutput('error',`${selfName()}: REFUSE·signed nothing landed · ${outdated.length} lines a lane signed stand at no epoch this act\n`);
    return { kind: 'exit', code: 1 };
  }
  const keyFile = host?undefined:valueOf(args, FLAGS.keyFile);
  const keyId = host?.keyId??valueOf(args, FLAGS.key)??ownerOf(store);
  if(drafted.length)assertNativeSigner(keyId);
  const publicKey = drafted.length ? publicKeyOf(root, keyId) : undefined;
  if (drafted.length && !publicKey) {
    hostOutput('error',`${selfName()}: unknown key ${keyId} — name it in ${selfName()}.keys\n`);
    return { kind: 'exit', code: 2 };
  }
  let signed: string[] = proposed.filter((line) => fieldOf(line, 'sig'));
  if(drafted.length){
    notCancelled(host?.signal);
    const signers=authorityFor(lockLines(store),rootSigner(root),signaturesOf(store).admitted).admitted;
    const selected=signers.find(s=>s.id===keyId);
    const prospective=drafted.map(line=>{const p=parse(line);if(p.kind!=='fact')throw new BoundRefusal('host/context','REFUSE·invalid lot');return canonical({...p.value.fields,by:keyId,epoch:String(epoch)});});
    const family=wordOf(lockStanding(store),'families','region');
    const ownership=withOwnPreview(root,()=>ownedOf(root,prospective,line=>{const p=parse(line);return p.kind==='fact'&&selected!==undefined&&authorityAtEpoch(p.value.fields,selected,epoch,fieldOf(line,'scope'),'authority').kind==='admitted';},by=>signers.find(s=>s.id===by)?.coverage??[],named,line=>{const sources=drafted.filter((_,i)=>prospective[i]===line);const heads=byFile.flatMap(([heads,lines])=>sources.some(draft=>lines.includes(draft))?heads:[]);return heads.length?heads:undefined;},(place,line)=>ownRecordCovered(line,place,family,signers)));
    const uncovered=[...ownership.nowhere].sort((a,b)=>Buffer.compare(Buffer.from(fieldOf(a,'scope')),Buffer.from(fieldOf(b,'scope'))));
    if(uncovered.length)throw new BoundRefusal('authority/coverage',`REFUSE·authority/coverage keyId=${keyId} scope=${fieldOf(uncovered[0]!,'scope')}`);
  }
  if (drafted.length) {
    let invoke;
    try { invoke = signerFor([...lockStanding(store), ...destinations.flatMap(place => ownLockOf(root, place))],
      keyId, host?.signer.name??valueOf(args, FLAGS.signer), keyFile,host?.signer); }
    catch (error) {
      if(error instanceof BoundRefusal)throw error;
      hostOutput('error',`${selfName()}: ${error instanceof Error ? error.message : 'REFUSE·signer unavailable'}\n`);
      return { kind: 'exit', code: 1 };
    }
    const got = await signConsentLot(drafted, { epoch, by: keyId, algorithm: signaturesOf(store).era },
      publicKey!, signaturesOf(store).admitted, invoke);
    if (got.kind === 'refuse') {
      hostOutput('error',`${selfName()}: ${got.why}\n`);
      return { kind: 'exit', code: 1 };
    }
    let index = 0;
    signed = proposed.map(line => fieldOf(line, 'sig') ? line : got.lines[index++]!);
  }
  const guarded=configurationAdmissionGuards(root,signed,named,line=>{const heads=byFile.flatMap(([heads,lines])=>lines.some(draft=>sayingOf(draft)===sayingOf(line))?heads:[]);return heads.length?heads:undefined});
  if(guarded.kind==='refuse'){hostOutput('error',`${selfName()}: REFUSE·${guarded.code} ${guarded.diagnostic} · nothing landed\n`);return {kind:'exit',code:1};}
  const ownership=guarded.ownership;
  if (refusesAdmission(root, ownership.ledger, lockStanding(store))) return { kind: 'exit', code: 1 };
  if(signed.some(line=>!isConfig(line))) {try {await admittedObjects(root,[...signedOwnerLines(store),...signed],text=>hostOutput('out',text+'\n'));}catch(e){hostOutput('error',`${selfName()}: ${e instanceof Error?e.message:String(e)} · nothing landed\n`);return {kind:'exit',code:1};}}
  const evidence=await underRootAuthority(store,'prospective admission evidence',()=>admissionEvidenceResult(root,ownership.ledger,lockStanding(store),Date.now()));
  if(evidence.kind==='refuse'){hostOutput('error',`${selfName()}: ${evidence.diagnostic} · nothing landed\n`);return {kind:'exit',code:1};}
  return { kind: 'signed', signed, epoch, base, ...(drafted.length ? { keyId } : {}) };
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
  const contextFiles=positionalsOf(args);
  if(contextFiles.length===1&&hasContextualPlace(root)&&!claimLinesIn(contextFiles[0]!).length){
    if(namedPlaces(args).length||valueOf(args,FLAGS.key)||valueOf(args,FLAGS.keyFile)||valueOf(args,FLAGS.signer))throw Error('REFUSE·contextual place accepts one already signed context envelope');
    const result=await landContextualPlace(root,contextFiles[0]!);hostOutput('out',JSON.stringify({profile:'place-act-context@1',identity:result.identity,status:result.kind,context:result.context,receipts:result.receipts})+'\n');return 0;
  }
  const named = namedPlaces(args);
  const placed = positionalsOf(args).reduce((all, file) => ((places) => (places.length ? claimLinesIn(file).reduce((got, line) => got.set(sayingOf(line), [...new Set([...(got.get(sayingOf(line)) ?? []), ...places])]), all) : all))(placesOfFile(file)), new Map<string, readonly string[]>());
  const batch = await signedBatch(root, args, positionalsOf(args));
  return finishAcceptance(root,args,batch,placed,started);
}

/** Root host boundary, sharing signing, wire, coverage, takes and publication
 * with accept(). No file is manufactured for a batch of already-owned bytes. */
export async function acceptRootRecords(root:string,host:RootAdmissionHost):Promise<number>{
 requireEffects('Root lot admission');notCancelled(host.signal);
 if(!actResultProfile(lockStanding(storeOf(root))))throw new BoundRefusal('host/act','REFUSE·Root host requires the admitted atomic result profile');
 const started=Date.now(),batch=await signedBatch(root,[],[],host);
 return finishAcceptance(root,[],batch,new Map(),started,host);
}

async function finishAcceptance(root:string,args:readonly string[],batch:Batch,placed:ReadonlyMap<string,readonly string[]>,started:number,host?:RootAdmissionHost):Promise<number>{
  const named=namedPlaces(args);
  if (batch.kind === 'exit') return batch.code;
  if (batch.kind === 'once') return underTheLock(storeOf(root), 'land', () => repaid(root, batch.proposed, started));
  const store = storeOf(root);
  const authority = authorityFor([...lockLines(store), ...batch.signed], rootSigner(root), signaturesOf(store).admitted);
  const owned = ownedOf(root, batch.signed, (line) => authority.of(line).kind === 'admitted', (by) => authority.admitted.find((one) => one.id === by)?.coverage ?? [], named, (line) => placed.get(sayingOf(line)));
  if (owned.nowhere.length) {
    for (const line of owned.nowhere) hostOutput('error',`NOWHERE  ${fieldOf(line, 'scope')} · ${((got) => (got.kind === 'admitted' ? 'admitted' : got.why))(authority.of(line))}, and ${named.length ? `no place of ${named.join(', ')} takes it` : 'no one own lock it covers takes it: name the places with --place'}\n`);
    hostOutput('error',`${selfName()}: REFUSE·nowhere nothing landed · ${owned.nowhere.length} lines neither the ledger nor an own lock admits: a line is landed signed where it stands, never written in bare\n`);
    return 1;
  }
  const places = placesIn(root);
  const pinned = [...new Set([...owned.own.keys(), ...named])];
  const touched = pinned.length === 0 && owned.ledger.length ? touchedBy(root, places, owned.ledger, lockStanding(store)) : [];
  const every = pinned.length === 0 && touched.length === places.length && places.length > 0;
  const regions = (pinned.length ? pinned : every ? places : touched).filter((one) => places.includes(one));
  const where = every ? 'every place · then the root, where the places join' : regions.length ? regions.map((one) => `${one}/`).join(' · ') : 'the root alone, where the places join';
  hostOutput('out',`ACTS     ${where} · ${owned.ledger.length} lines to the ledger${[...owned.own].map(([place, lines]) => ` · ${lines.length} to ${place}'s own lock`).join('')} · before the lock\n`);
  const asked = Date.now();
  // Root-ledger writes may change grants or inherited policies. Child-only
  // lots read that authority through publication, without excluding siblings.
  const rootWrite = owned.ledger.length > 0 || every || regions.length === 0;
  const enter = rootWrite ? underTheRegions : underAuthorityRegions;
  return enter(store, rootWrite ? [...regions, ''] : regions, 'land', () => acceptNow(root, { ...batch, signed: owned.ledger, records:batch.signed }, started, owned, asked, regions,host));
}

async function acceptNow(root: string, batch: Extract<Batch, { readonly kind: 'signed' }>, started: number, owned: Owned, asked = started, descent: readonly string[] = [],host?:RootAdmissionHost): Promise<number> {
  const waited = Date.now() - asked;
  if (waited > 60_000) hostOutput('out',`RED      wait ${Math.round(waited / 1000)} s for the lock before the act · a wait over a minute is a red\n`);
  const spent: string[] = [`sign ${asked - started}`, `wait ${waited}`];
  const took = timing(spent);
  const { signed, epoch } = batch;
  if(refusesStandingPins(root,batch.records??signed))return 1;
  const store = storeOf(root);
  const currentBase = fullDigest(store, localActLines(root, batch.base.places));
  if (currentBase !== batch.base.digest) {
    hostOutput('error',`${selfName()}: REFUSE·base moved ${batch.base.digest} → ${currentBase} · nothing landed\n`);
    return 1;
  }
  try {assertProspectiveRootClockSelection(root,signed);}
  catch(error){hostOutput('error',`${selfName()}: ${error instanceof Error?error.message:String(error)} · nothing landed\n`);return 1;}
  if(signed.some(line=>!isConfig(line))) {
    try {await admittedObjects(root,[...signedOwnerLines(store),...signed]);}
    catch(e){hostOutput('error',`${selfName()}: ${e instanceof Error?e.message:String(e)} · nothing landed\n`);return 1;}
  }
  const snapshot = took('lines', () => standingOf(root));
  if (refusesAdmission(root, signed, snapshot.standing)) return 1;
  let evidence: ReturnType<typeof admissionEvidence>;
  const checkedEvidence=took('evidence',()=>admissionEvidenceResult(root,signed,snapshot.standing,Date.now()));
  if(checkedEvidence.kind==='refuse'){hostOutput('error',`${selfName()}: ${checkedEvidence.diagnostic} · nothing landed\n`);return 1;}
  evidence=checkedEvidence.evidence;
  const fold = evidence.fold;
  const authority = took('authority', () => authorityFor([...lockLines(store), ...signed], rootSigner(root), signaturesOf(store).admitted));
  for (const line of signed) {
    const verdict = authority.of(line);
    if (verdict.kind !== 'admitted') {
      hostOutput('error',`${selfName()}: ${verdict.kind === 'refuse' ? verdict.why : `REFUSE·authority grey: ${verdict.why}`}\n`);
      return 1;
    }
  }
  const withdraws = signed.filter((line) => fieldOf(line, 'value') === 'withdraw');
  const coordinates = evidence.coordinates;
  const withdrawn = withdraws.length ? withdrawal(withdraws, lockLines(store)) : null;
  const view = `${wordOf(fold.standing, 'families', 'view')}/`;
  const lot = fullDigest(store, signed);
  const tree = hasVouchedTree(store)
    ? fullDigest(store, [...vouchedCoordinates(store)].sort(([a], [b]) => a.localeCompare(b)).map(([coordinate, digest]) => `${coordinate} ${digest}`))
    : 'key' in fold && typeof fold.key === 'string' ? fold.key : fullDigest(store, fold.standing);
  const cached = keptTakes(keptVerdict(store, tree, lot));
  const judged = cached ?? evidence.judged;
  if (!cached) keepVerdict(store, tree, lot, judged.map(packTake));
  const refused = judged.filter((one) => one.kind === 'refused' || (one.kind === 'judged' && one.verdict.kind === 'refuse'));
  if (refused.length) {
    for (const one of refused) hostOutput('out',`REFUSE   take ${one.scope} · ${one.kind === 'judged' ? one.verdict.why : one.kind === 'refused' ? one.why : ''}\n`);
    hostOutput('error',`${selfName()}: REFUSE·takes nothing landed · ${refused.length} takes refused: a batch lands whole or not at all\n`);
    return 1;
  }
  const told = took('told', () => standingOf(root, undefined, signed));
  for (const name of openedBy(descent, told.standing, signed)) hostOutput('error',`OPEN     ${name}\n`);
  if (owned.own.size) layReleases(store, root, told.standing, store);
  const resultProfile=actResultProfile(snapshot.standing);
  let landed:readonly {at:string;appended:number}[]=[];
  if(resultProfile){
    const records=batch.records??signed;
    const placements=[...(signed.length?[{place:'.',records:signed}]:[]),...[...owned.own].map(([place,records])=>({place:`${place}/${LOCK}`,records}))];
    const digest=(bytes:string)=>bytesDigest(store,new TextEncoder().encode(bytes));
    const identity=actIdentity(records,{...resultProfile,digest,placements,localEpoch:epoch});
    const folder=writerFor(snapshot.standing,'fold');
    if(!folder)throw Error('REFUSE·act native result requires a declared fold identity');
    const receipt=canonical({scope:resultProfile.scope,at:resultProfile.context,role:'writes',form:'alphabet',measure:'digest',value:identity,by:folder,epoch:String(epoch)});
    const bundle={records:records.join('\n')+'\n',receipt:receipt+'\n',placements:placements.map(p=>({place:p.place,records:p.records.join('\n')+'\n'}))};
    notCancelled((host?.signal??currentActSignal()));host?.prepared?.(identity);notCancelled((host?.signal??currentActSignal()));
    const committed=await commitLocalAct(store,identity,descent,async()=>bundle,intactLocalAct,host?.storage,(host?.signal??currentActSignal()));
    host?.committed?.(identity,committed,committed.kind);
    // Commitment precedes projections and conformance work. If either fails,
    // this public identity still names the admitted act; it is never rollback.
    hostOutput('out',`ACT ${identity} · epoch ${epoch} · admitted · conformance not asserted\n`);
    for(const line of records)hostOutput('out',line+'\n');
    hostOutput('out',receipt+'\n');
    landed=[{at:'committed act '+identity,appended:records.length}];
  }else landed=took('land',()=>[...new Set(signed.map(line=>fieldOf(line,'by')))].map(by=>land(store,by,signed.filter(line=>fieldOf(line,'by')===by))));
  for (const [place, lines] of owned.own) landOwned(root, place, lines,resultProfile!==undefined);
  return underRootProjection(store, 'projection', async () => {
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
    for (const path of coordinates.taken) hostOutput('out',`GONE     ${path} · withdrawn by its line\n`);
  }
  for (const one of judged) landTake(root, one, []);
  const standingAsked = [...signed, ...fold.standing].filter((line) => fieldOf(line, 'role') === 'demands' && fieldOf(line, 'value') !== 'withdraw');
  const paidScopes = new Set(paidOf(store, standingAsked, fold.observed, view).paid.map((line) => fieldOf(line, 'scope')));
  const late = lateFacts(store, [...signed, ...fold.standing], paidScopes);
  if (late.length) {
    land(store, 'judge', late);
    for (const line of late) if (fieldOf(line, 'measure') !== 'cone') hostOutput('out',`LATE     ${fieldOf(line, 'scope')} · answered from the landed cone\n`);
  }
  if (signed.some((line) => fieldOf(line, 'scope').startsWith(`${basename(ownRoot())}/`) && !fieldOf(line, 'scope').split('/').slice(1, -1).includes('uses'))) {
    const code = instrumentOf(store, entryOf(root), told.standing, root, ownLock());
    if (instrumentKept(store) !== code) {
      const open = await closeReceipts(root, store);
      instrumentKeep(store, code);
      hostOutput('error',`open by instrument · ${open.length}\n`);
    }
  }
  const rendered = took('render', () => renderInto(root, store));
  hostOutput('out',`RENDER 0\n`);
  const own = new Set([...owned.own.values()].flat()).size;
  const perLine = Math.round((Date.now() - started) / Math.max(1, signed.length + own));
  const folder = writerFor(fold.standing, 'fold');
  const beat = (ms: number, at: string): string => canonical({ scope: 'beat/accept', role: 'writes', form: 'interval', measure: 'ms', value: `${ms}..${ms}`, by: folder ?? '', at: `place:${at}` });
  if (folder !== undefined) land(store, folder, [beat(perLine, 'line'), beat(1, fold.kept ? 'kept' : 'folded'), beat(Date.now() - started, 'total')]);
  hostOutput('out',
    `FACT     signed ${signed.length + own} · landed ${landed.length ? landed.map((one) => `${one.appended} in ${one.at}`).join(' · ') : '0'}${[...owned.own].map(([place, lines]) => ` · ${lines.length} in ${place}/${LOCK}`).join('')} · epoch ${epoch}\n`
    + `TARGET   ${rendered.standing} claims · ${rendered.forks.length} forks · ${rendered.vacuous.length} vacuous · ${rendered.grey.length} grey · ${rendered.refused.length} refused · readings · no encounters computed · ${Date.now() - started} ms\n`
    + `SPENT    ${spent.join(' ms · ')} ms · ${signed.length} lines\n`,
  );
  if (withdrawn) {
    hostOutput('out',`WITHDRAW ${withdrawn.taken.length} taken · ${withdrawn.exact.length} exact on distributive scales · ${withdrawn.open.length} on open scales, not computed\n`);
    for (const line of withdrawn.inexact) hostOutput('out',`INEXACT  ${fieldOf(line, 'scope')} · its scale is not distributive: what the others hold is not what they held without it\n`);
  }
  return 0;
  });
}

/**
 * A batch landed twice is one: nothing of it lands again. What it left unpaid is judged again, the way it would be now:
 * each of its demands the fold counts unpaid is taken, and the takes land only when all of it holds.
 */
function repaid(root: string, proposed: readonly string[], started: number): number {
  const store = storeOf(root);
  const prior=committedLocalActs(store).find(act=>{const lines=act.bundle.records.trimEnd().split('\n');return lines.length===proposed.length&&lines.every((line,i)=>line===proposed[i])});
  if(prior){hostOutput('out',`ACT ${prior.identity} · epoch ${fieldOf(prior.bundle.receipt.trim(),'epoch')} · admitted · replay\n`+prior.bundle.records+prior.bundle.receipt);}
  const asked = new Set(proposed.filter((line) => fieldOf(line, 'role') === 'demands').map((line) => fieldOf(line, 'scope')));
  const view = `${wordOf(foldClaims(signedOwnerLines(store)).standing, 'families', 'view')}/`;
  const standingAsked = signedDemands(store).filter((line) => asked.has(fieldOf(line, 'scope')) && !fieldOf(line, 'scope').startsWith(view));
  const owed = paidOf(store, standingAsked, [], view).missing;
  if (!owed.length) {
    hostOutput('out',`ONCE     ${proposed.length} lines · every one already landed and every demand of it paid: a batch landed twice is one, nothing landed\n`);
    return 0;
  }
  const judged = owed.map((line) => judgeDemand(root, line));
  hostOutput('out',`ONCE     ${proposed.length} lines · every one already landed · ${owed.length} of its demands unpaid, judged again\n`);
  if (judged.every((one) => one.kind === 'owed')) {
    for (const one of judged) landTake(root, one, []);
    return 0;
  }
  const refused = judged.filter((one) => one.kind === 'refused' || (one.kind === 'judged' && one.verdict.kind === 'refuse'));
  if (refused.length) {
    for (const one of refused) hostOutput('out',`REFUSE   take ${one.scope} · ${one.kind === 'judged' ? one.verdict.why : one.kind === 'refused' ? one.why : ''}\n`);
    hostOutput('error',`${selfName()}: REFUSE·takes nothing landed · ${refused.length} takes refused: what a batch left unpaid is paid whole or not at all\n`);
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
    for (const line of late) if (fieldOf(line, 'measure') !== 'cone') hostOutput('out',`LATE     ${fieldOf(line, 'scope')} · answered from the landed cone\n`);
  }
  const rendered = renderInto(root, store);
  hostOutput('out',`RENDER 0\n`);
  hostOutput('out',`TARGET   ${rendered.standing} claims · ${rendered.forks.length} forks · ${rendered.vacuous.length} vacuous · ${rendered.grey.length} grey · ${rendered.refused.length} refused · readings · no encounters computed · ${Date.now() - started} ms\n`);
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
