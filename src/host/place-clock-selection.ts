/** Fixed HOST construction for the opt-in SDK clock profile. No CLI activation,
 * inferred genesis, new wire fields, or packet-supplied signature verifier. */
import {createHash} from 'node:crypto';
import {PLACE_ACT_CONTEXT,readPlaceActContext,type ClockBudget,type RootContext,type TrustedClockContract} from '@lapxo/topos/core';
import {canonical,signedBytes,wireAt,type Signer} from '@lapxo/topos/wire';
import {foldClaims,isConfig,fieldOf,parsedLine as parse} from '../fold/claims.ts';
import {eraOf} from '../fold/digests.ts';
import {authorityFor} from '../fold/signers.ts';
import {verifyBytes} from './adapters/keys/ed25519.ts';
import {verifiesOwnerLine} from '../land/sign.ts';
import {placeActHeads,type PlaceActTrust,type PlaceActBudget,type PlaceActHead} from './ports/place-act.ts';
export interface HostClockSelection {
 readonly profile:typeof PLACE_ACT_CONTEXT;readonly namespace:string;readonly regionFamily:string;
 readonly receiptSigner:string;readonly receiptScope:string;readonly digestAlgorithm:'sha256';
 readonly budget:ClockBudget;readonly storageBudget:PlaceActBudget;
 readonly initial:readonly {place:string;receiver:{identity:string;epoch:string};origin:{prefix:string;epoch:string}}[];
}
export interface HostClockInput {
 readonly store:string;readonly selector:string;readonly profileSelector:string;readonly history:readonly string[];readonly anchor:Signer;readonly algorithms:readonly string[];
 readonly legacyOriginals:readonly string[];
 /** Actual protected Root authority cursor: an authenticated signed Root config
  * checkpoint, never a sibling receipt/evidence max epoch. */
 readonly authorityCheckpoint:string;
 /** Fixed host historical predecessor proof, never taken from a packet. */
 readonly authenticatedReceiverHeads?:readonly PlaceActHead[];
 readonly readCurrent:()=>Pick<HostClockInput,'history'|'anchor'|'algorithms'|'legacyOriginals'|'authorityCheckpoint'>;
 readonly resources:{bytes:number;lines:number;places:number};
 readonly inherited:{clock:ClockBudget;storage:PlaceActBudget};
 readonly historical:(encoded:string)=>TrustedClockContract;
}
const fail=(why:string):never=>{throw Error('REFUSE·clock selection '+why)};
const digest=(s:string)=>'sha256:'+createHash('sha256').update(s).digest('hex');
const text=(s:unknown):s is string=>typeof s==='string'&&s.length>0;
const clock=(s:unknown)=>{if(typeof s!=='string'||!/^(0|[1-9][0-9]*)$/.test(s)||!Number.isSafeInteger(Number(s)))fail('unknown clock');return Number(s)};
// Exact-byte parsing returns frozen values. Retain only this pure syntax verdict;
// history, signatures, authority windows, clocks and protected rereads stay fresh.
const canonicalValues=new WeakSet<object>();
const f=(line:string)=>{const got=parse(line);if(got.kind!=='fact')return fail('noncanonical history');if(!canonicalValues.has(got.value)){if(canonical(got.value.fields,got.value.version)!==line)fail('noncanonical history');canonicalValues.add(got.value);}return got.value.fields};
/** Root chooses selector and anchors/resources from its authenticated standing.
 * Selection must be ROOT signed; a world's signature grants no host capability. */
export function hostClockSelection(input:HostClockInput):{selection:HostClockSelection;trust:PlaceActTrust} {
 const b=input.resources;if(!b||Object.keys(b).sort().join(',')!=='bytes,lines,places'||Object.values(b).some(n=>!Number.isSafeInteger(n)||n<1))fail('missing input resources');
 const inherited=input.inherited;if(!inherited?.clock||Object.keys(inherited.clock).sort().join(',')!=='bytes,placements,policies,proofs,records,signers'||!inherited.storage||Object.keys(inherited.storage).sort().join(',')!=='acts,bytes'||[...Object.values(inherited.clock),...Object.values(inherited.storage)].some(n=>!Number.isSafeInteger(n)||n<1))fail('missing inherited resource authority');
 if(input.history.length+input.legacyOriginals.length>b.lines)fail('input line budget');let bytes=0;for(const line of [...input.history,...input.legacyOriginals]){if(typeof line!=='string'||line.length>b.bytes||(bytes+=Buffer.byteLength(line))>b.bytes)fail('input byte budget')}
 const snapshots=new Map<number,ReturnType<typeof authorityFor>>();
 for(const original of input.history){const epoch=clock(f(original).epoch??fail('history clock absent'));let authority=snapshots.get(epoch);
  if(!authority){const before=input.history.filter(l=>!isConfig(l)||clock(f(l).epoch??fail('history clock absent'))<=epoch);authority=authorityFor(before,input.anchor,eraOf(foldClaims(before.filter(l=>fieldOf(l,'scope').startsWith('wire/'))).standing).admitted);snapshots.set(epoch,authority)}
  if(authority.of(original).kind!=='admitted')fail('history not authenticated at admission');
 }
 const live=foldClaims(input.history.filter(isConfig)).standing.filter(l=>fieldOf(l,'value')!=='withdraw');
 const ids=live.filter(l=>{const p=f(l);return p.scope===input.profileSelector&&p.measure==='id'});if(ids.length!==1||f(ids[0]!).value!==PLACE_ACT_CONTEXT||f(ids[0]!).role!=='writes'||f(ids[0]!).form!=='alphabet'||f(ids[0]!).by!==input.anchor.id)fail('missing/ambiguous clock profile id');
 const rows=live.filter(l=>{const p=f(l);return p.scope===input.selector&&p.measure==='text'});if(rows.length!==1)fail('missing/ambiguous Root selector');
 const line=rows[0]!,fields=f(line);if(fields.by!==input.anchor.id||fields.role!=='writes'||fields.form!=='alphabet'||fields.value!=='lock'||!verifiesOwnerLine(line,input.anchor.publicKey,input.algorithms))fail('selector is not Root signed');
 if(!fields.about||fields.about.length>b.bytes)fail('missing selector body');let selection:HostClockSelection;try{selection=JSON.parse(fields.about)}catch{return fail('selector JSON')}
 if(!selection||Object.keys(selection).sort().join(',')!=='budget,digestAlgorithm,initial,namespace,profile,receiptScope,receiptSigner,regionFamily,storageBudget'||selection.profile!==PLACE_ACT_CONTEXT||selection.digestAlgorithm!=='sha256'||!text(selection.namespace)||!text(selection.regionFamily)||!text(selection.receiptSigner)||!text(selection.receiptScope)||!Array.isArray(selection.initial)||!selection.initial.length||selection.initial.length>b.places)fail('unsupported selector shape');
 if(JSON.stringify(selection)!==fields.about)fail('noncanonical selector JSON');
 if(!selection.budget||Object.keys(selection.budget).sort().join(',')!=='bytes,placements,policies,proofs,records,signers'||Object.values(selection.budget).some(n=>!Number.isSafeInteger(n)||n<1)||!selection.storageBudget||Object.keys(selection.storageBudget).sort().join(',')!=='acts,bytes'||Object.values(selection.storageBudget).some(n=>!Number.isSafeInteger(n)||n<1))fail('missing selected resources');
 for(const name of ['bytes','records','placements','policies','proofs','signers'] as const)if(selection.budget[name]>inherited.clock[name])fail('clock resource exceeds inherited '+name);for(const name of ['acts','bytes'] as const)if(selection.storageBudget[name]>inherited.storage[name])fail('storage resource exceeds inherited '+name);
 if(selection.budget.bytes>b.bytes||selection.storageBudget.bytes>b.bytes||selection.budget.records>b.lines||selection.budget.placements>b.places)fail('selected resources exceed input authority');
 const wire=wireAt(live.map(f),Number.MAX_SAFE_INTEGER);if(!wire||!wire.digests.has(selection.digestAlgorithm))fail('digest algorithm not declared');
 const authority=authorityFor(input.history,input.anchor,input.algorithms);
 if(!input.history.includes(input.authorityCheckpoint)||!isConfig(input.authorityCheckpoint))fail('missing authenticated Root authority checkpoint');
 const checkpointEpoch=clock(f(input.authorityCheckpoint).epoch??fail('Root authority clock absent'));if(snapshots.get(checkpointEpoch)?.of(input.authorityCheckpoint).kind!=='admitted')fail('Root checkpoint not admitted at original epoch');
 const epoch=clock(f(input.authorityCheckpoint).epoch??fail('Root authority clock absent'));if(input.history.filter(isConfig).some(l=>clock(f(l).epoch??fail('history clock absent'))>epoch))fail('authority checkpoint precedes Root configuration');
 const prefix=digest(input.history.join('\n')+'\n'),head=digest(live.join('\n')+'\n');
 const policies=[...new Set(live.map(digest))].sort();if(policies.length>selection.budget.policies)fail('actual dependency budget');
 const root:RootContext={namespace:selection.namespace,snapshot:digest(JSON.stringify([prefix,head,String(epoch)])),epoch:String(epoch),prefix,head,policies};
 const initialHeads:PlaceActHead[]=selection.initial.map(i=>{if(!i||!i.receiver||!i.origin||!text(i.receiver.identity)||!text(i.origin.prefix)||!text(i.place))fail('unknown initial namespace');const parts=i.place.split('/');if(i.place!=='.'&&(parts.length<2||parts.at(-1)!=='TARGET.bound'||parts.some(s=>s===''||s==='.'||s==='..')))fail('unknown initial namespace');clock(i.receiver.epoch);clock(i.origin.epoch);return{place:i.place,identity:i.receiver.identity,epoch:i.receiver.epoch}});
 if(new Set(initialHeads.map(h=>h.place)).size!==initialHeads.length)fail('duplicate namespace');
 const legacy=new Set(input.legacyOriginals.map(l=>digest(signedBytes(f(l)))));
 let heads:readonly PlaceActHead[]=[];
 const contract:TrustedClockContract={budget:selection.budget,root,signers:authority.admitted,places:initialHeads.map(h=>h.place),regionFamily:selection.regionFamily,receiptSigner:selection.receiptSigner,receiptScope:selection.receiptScope,digest,
  verifiesRootContext:c=>JSON.stringify(c)===JSON.stringify(root),
  verifiesNamespaceAdmission:p=>{if(p==='.')return true;const parts=p.split('/');if(parts.length<2||parts.pop()!=='TARGET.bound'||parts.some(s=>s===''||s==='.'||s==='..'))return false;const n=parts.join('/'),rows=live.filter(l=>f(l).scope===selection.regionFamily+'/'+n);if(rows.length!==1)return false;const v=f(rows[0]!);return v.role==='writes'&&v.form==='alphabet'&&v.measure==='coordinates'&&v.value===n+'/**'},
  verifiesNewLocalPrefix:(p,prefix,epoch,originals)=>{const h=heads.find(h=>h.place===p),i=selection.initial.find(i=>i.place===p);if(!h||!i||originals.some(l=>legacy.has(digest(signedBytes(f(l))))))return false;return h.identity===i.receiver.identity?prefix===i.origin.prefix&&epoch===i.origin.epoch:prefix===h.identity&&clock(epoch)===clock(h.epoch)+1},
  verifiesOriginal:(l,s)=>verifiesOwnerLine(l,s.publicKey,input.algorithms),
  verifiesProof:(text,signature,s)=>verifyBytes(text,s.publicKey,signature,input.algorithms),
 };
 heads=input.authenticatedReceiverHeads??placeActHeads(input.store,initialHeads,{contract,historical:input.historical},selection.storageBudget);
 const trust:PlaceActTrust={contract,initialHeads,current:()=>{const fresh=hostClockSelection({...input,...input.readCurrent(),authenticatedReceiverHeads:undefined});return{root:fresh.trust.contract.root,heads:placeActHeads(input.store,fresh.trust.initialHeads,fresh.trust,fresh.selection.storageBudget)}},historical:input.historical};
 return{selection,trust};
}
