import {existsSync,opendirSync,statSync} from 'node:fs';
import {join,basename} from 'node:path';
/** Actual stored Root cursor. Inputs are fixed host selections from admitted
 * lines, never packet epochs, receipt maxima, or caller-supplied verification. */
import {committedLocalActs,actLines} from './ports/local-act.ts';
import {verifiedLegacyActResult} from '../cli/act-result.ts';
import {admissionAnchor,admissionHistoryAt} from '../fold/admission-history.ts';
import {authorityFor} from '../fold/signers.ts';
import {eraOf} from '../fold/digests.ts';
import {fieldOf,foldClaims,isConfig,selfName} from '../fold/claims.ts';
import {authenticatedRootStanding} from './admitted-place.ts';
import {verifiesOwnerLine} from '../land/sign.ts';
import {placesIn} from '../fold/places.ts';
import {appliedHistoryIn} from '../fold/signed.ts';
import {storeOf} from '../land/ledger.ts';
import {hostClockSelection,type HostClockInput} from './place-clock-selection.ts';
import {readPlaceActContext,placeActReceiptsOf,type PlaceReceipt,type ClockBudget,type TrustedClockContract} from '@lapxo/topos/core';
import {placeActResult,placeActHeads} from './ports/place-act.ts';
import {rootAuthorityProtection} from '../land/act.ts';
import {readOnly} from './read-only.ts';
import type {PlaceActBudget} from './ports/place-act.ts';
export interface RootClockSourceSelection {
 readonly selector:string;readonly profileSelector:string;readonly bootstrapCheckpoint:{scope:string;measure:string};
 readonly resources:{bytes:number;lines:number;places:number;acts:number};
 readonly inherited:{clock:ClockBudget;storage:PlaceActBudget};
}
const fail=(s:string):never=>{throw Error('REFUSE·Root cursor '+s)};
function sourceSelection(selected:RootClockSourceSelection){
 const b=selected?.resources;if(!b||Object.keys(b).sort().join(',')!=='acts,bytes,lines,places'||Object.values(b).some(n=>!Number.isSafeInteger(n)||n<1)||typeof selected.selector!=='string'||!selected.selector||typeof selected.profileSelector!=='string'||!selected.profileSelector||!selected.bootstrapCheckpoint||Object.keys(selected.bootstrapCheckpoint).sort().join(',')!=='measure,scope'||typeof selected.bootstrapCheckpoint.scope!=='string'||!selected.bootstrapCheckpoint.scope||typeof selected.bootstrapCheckpoint.measure!=='string'||!selected.bootstrapCheckpoint.measure)fail('missing admitted source selection');
 if(!selected.inherited?.clock||Object.keys(selected.inherited.clock).sort().join(',')!=='bytes,placements,policies,proofs,records,signers'||!selected.inherited.storage||Object.keys(selected.inherited.storage).sort().join(',')!=='acts,bytes'||[...Object.values(selected.inherited.clock),...Object.values(selected.inherited.storage)].some(n=>!Number.isSafeInteger(n)||n<1))fail('missing inherited source budgets');return b;
}
function boundedInventory(root:string,selected:RootClockSourceSelection){
 const b=sourceSelection(selected),store=storeOf(root);let bytes=0,files=0,entries=0;const limit=b.acts*(b.places+2)+b.lines;if(!Number.isSafeInteger(limit))fail('source file bound');
 const visit=(path:string)=>{if(!existsSync(path))return;const s=statSync(path);if(s.isDirectory()){const directory=opendirSync(path);try{for(let entry=directory.readSync();entry;entry=directory.readSync()){if(++entries>limit)fail('source entry budget');if(basename(path)==='ledger'&&entry.name==='place-acts')continue;visit(join(path,entry.name))}}finally{directory.closeSync()}}else{if(!s.isFile()||++files>limit||(bytes+=s.size)>b.bytes)fail('source file/byte budget')}};
 visit(join(store,'ledger'));visit(join(store,selfName()+'.keys'));
}
function current(root:string,selected:RootClockSourceSelection){
 const b=sourceSelection(selected);boundedInventory(root,selected);
 const history=admissionHistoryAt(root,Number.MAX_SAFE_INTEGER);if(history.length>b.lines)fail('history line budget');let bytes=0;for(const line of history)if((bytes+=Buffer.byteLength(line))>b.bytes)fail('history byte budget');
 const acts=committedLocalActs(storeOf(root));if(acts.length>b.acts)fail('act inventory budget');
 const rooted=acts.flatMap(a=>{const roots=a.bundle.placements?.filter(p=>p.place==='.')??[];if(!roots.some(p=>actLines(p.records).some(isConfig)))return[];const verified=verifiedLegacyActResult(root,a.identity);return[{...verified,identity:a.identity,roots}]});
 // Comparison is over verified committed Root CONFIGURATION acts only. This
 // is the existing local-act cursor, not a new maximum over arbitrary records.
 rooted.sort((a,b)=>a.epoch-b.epoch);if(rooted.some((a,i)=>i>0&&a.epoch===rooted[i-1]!.epoch&&a.identity!==rooted[i-1]!.identity))fail('ambiguous committed Root cursor');
 const latest=rooted.at(-1),anchor=admissionAnchor(root);
 let checkpoint:string;
 if(latest){const rows=latest.roots.flatMap(p=>actLines(p.records)).filter(isConfig);if(!rows.length)fail('verified Root act has no configuration checkpoint');checkpoint=rows[0]!;
 }else{const rows=history.filter(l=>fieldOf(l,'scope')===selected.bootstrapCheckpoint.scope&&fieldOf(l,'measure')===selected.bootstrapCheckpoint.measure);if(rows.length!==1)fail('bootstrap checkpoint missing/ambiguous');checkpoint=rows[0]!}
 const epoch=Number(fieldOf(checkpoint,'epoch'));if(!Number.isSafeInteger(epoch)||epoch<0)fail('unknown committed Root epoch');
 // This synchronous observation already read the full current inventory. Select
 // its admission prefix without opening that same inventory a second time;
 // the next current() invocation still reads and authenticates fresh bytes.
 const prefix=history.filter(line=>!isConfig(line)||Number(fieldOf(line,'epoch'))<=epoch),algorithms=eraOf(foldClaims(prefix.filter(l=>fieldOf(l,'scope').startsWith('wire/'))).standing).admitted;
 const auth=authorityFor(prefix,anchor,algorithms);if(auth.of(checkpoint).kind!=='admitted')fail('checkpoint is not authenticated');
 const places=placesIn(root);if(places.length>b.places)fail('legacy namespace inventory budget');const legacy=[...new Set([...history,...places.flatMap(p=>appliedHistoryIn(root,p))])];if(legacy.length+prefix.length>b.lines||legacy.reduce((n,l)=>n+Buffer.byteLength(l),0)+prefix.reduce((n,l)=>n+Buffer.byteLength(l),0)>b.bytes)fail('legacy origin inventory budget');
 return{history:prefix,anchor,algorithms,authorityCheckpoint:checkpoint,legacyOriginals:legacy};
}
export function rootClockSource(root:string,selected:RootClockSourceSelection){
 const state=current(root,selected),visiting=new Set<string>(),cache=new Map<string,TrustedClockContract>();
 const historical=(encoded:string):TrustedClockContract=>{
  const cached=cache.get(encoded);if(cached)return cached;
  if(visiting.has(encoded)||visiting.size>=selected.resources.acts)fail('historical predecessor cycle/budget');visiting.add(encoded);
  try{
   const context=readPlaceActContext(encoded,selected.inherited.clock),epoch=context.root.epoch;
   const saved=admissionHistoryAt(root,Number(epoch));const rows=saved.filter(l=>isConfig(l)&&fieldOf(l,'epoch')===epoch);if(!rows.length)fail('historical checkpoint absent');
   // First obtain the explicitly declared historical genesis, without scanning
   // current receiver chains. Each non-genesis predecessor is then authenticated
   // through its stored signed receipt before supplying these HOST-only heads.
   const basic=hostClockSelection({...input,history:saved,authorityCheckpoint:rows[0]!,legacyOriginals:saved,authenticatedReceiverHeads:[],readCurrent:()=>current(root,selected)});
   const heads=context.places.map(p=>{const initial=basic.trust.initialHeads.find(h=>h.place===p.place);if(initial?.identity===p.previous)return initial;
    const prior=placeActResult(input.store,p.previous,{historical},basic.selection.storageBudget);if(!prior)fail('historical predecessor absent');
    const decoded=readPlaceActContext(prior!.context,selected.inherited.clock),place=decoded.places.find(one=>one.place===p.place);if(!place)fail('historical predecessor namespace absent');return{place:p.place,identity:p.previous,epoch:place!.epoch};
   });
   const result=hostClockSelection({...input,history:saved,authorityCheckpoint:rows[0]!,legacyOriginals:saved,authenticatedReceiverHeads:heads,readCurrent:()=>current(root,selected)}).trust.contract;
   cache.set(encoded,result);return result;
  }finally{visiting.delete(encoded)}
 };
 const input:HostClockInput={store:storeOf(root),selector:selected.selector,profileSelector:selected.profileSelector,...state,resources:{bytes:selected.resources.bytes,lines:selected.resources.lines,places:selected.resources.places},inherited:selected.inherited,readCurrent:()=>current(root,selected),historical};
 const resolved=hostClockSelection(input);
 // Host-only bytes from this exact authenticated constructor observation. This
 // is not a retained authority cache: every constructor calls current() again.
 const observedAnchor:import('@lapxo/topos/wire').Signer=Object.freeze({...state.anchor,coverage:Object.freeze([...state.anchor.coverage]),depth:Object.freeze({...state.anchor.depth}),admittedBy:Object.freeze([...state.anchor.admittedBy])});
 const observation=Object.freeze({history:Object.freeze([...state.history]),anchor:observedAnchor,algorithms:Object.freeze([...state.algorithms])});
 return {...resolved,observation,resources:Object.freeze({...selected.resources}),authority:(encoded:string)=>{const context=readPlaceActContext(encoded,selected.inherited.clock),saved=admissionHistoryAt(root,Number(context.root.epoch));const rows=saved.filter(l=>isConfig(l)&&fieldOf(l,'epoch')===context.root.epoch);if(!rows.length)fail('public historical checkpoint absent');return{anchor:state.anchor,history:saved,checkpoint:rows[0]!}}};
}

/** Source mapping is an explicit Root declaration; absence never means a zero
 * clock or an inferred cursor. Existing legacy callers do not request it. */
export function declaredRootClockSource(root:string){
 const live=authenticatedRootStanding(root),rows=live.filter(l=>fieldOf(l,'scope')==='wire/place-act-context-source'&&fieldOf(l,'measure')==='text'&&fieldOf(l,'value')!=='withdraw');
 if(rows.length!==1)fail('requires one admitted source mapping');
 const line=rows[0]!,anchor=admissionAnchor(root),algorithms=eraOf(live).admitted;
 if(fieldOf(line,'by')!==anchor.id||fieldOf(line,'role')!=='writes'||fieldOf(line,'form')!=='alphabet'||fieldOf(line,'value')!=='lock'||!verifiesOwnerLine(line,anchor.publicKey,algorithms))fail('mapping is not Root signed');
 const about=fieldOf(line,'about');let value:any;try{value=JSON.parse(about)}catch{return fail('mapping JSON invalid')}
 if(!value||Object.keys(value).sort().join(',')!=='bootstrapCheckpoint,inherited,profile,profileSelector,resources,selector'||value.profile!=='place-act-context@1'||JSON.stringify(value)!==about)fail('unknown/noncanonical mapping');
 return rootClockSource(root,value);
}
export function hasRootClockSource(root:string):boolean{return authenticatedRootStanding(root).some(l=>fieldOf(l,'scope')==='wire/place-act-context-source'&&fieldOf(l,'measure')==='text'&&fieldOf(l,'value')!=='withdraw')}

export interface PortablePlaceContext {readonly identity:string;readonly context:string;readonly receipts:readonly PlaceReceipt[];readonly authority:{anchor:import('@lapxo/topos/wire').Signer;history:readonly string[];checkpoint:string}}
/** Historical inspection ONLY. The expected acting Root anchor and resource
 * selection come from the consumer's selected place, never from this packet.
 * This function returns data and cannot construct a current command permit. */
export function inspectPortablePlaceContexts(encoded:string,expectedAnchor:import('@lapxo/topos/wire').Signer,selected:RootClockSourceSelection){
 sourceSelection(selected);
 if(typeof encoded!=='string'||Buffer.byteLength(encoded)>selected.resources.bytes)fail('portable byte budget');let rows:PortablePlaceContext[];try{rows=JSON.parse(encoded)}catch{return fail('portable JSON')}
 if(!Array.isArray(rows)||rows.length>selected.resources.acts)fail('portable context inventory budget');
 const byId=new Map<string,PortablePlaceContext>();for(const row of rows){if(!row||typeof row.identity!=='string'||typeof row.context!=='string'||!row.authority||JSON.stringify(row.authority.anchor)!==JSON.stringify(expectedAnchor)||!Array.isArray(row.authority.history)||!Array.isArray(row.receipts)||byId.has(row.identity))fail('portable anchor/shape/identity');byId.set(row.identity,row)}
 const done=new Map<string,{contract:TrustedClockContract;context:ReturnType<typeof readPlaceActContext>}>(),visiting=new Set<string>();
 const inspect=(id:string):{contract:TrustedClockContract;context:ReturnType<typeof readPlaceActContext>}=>{const saved=done.get(id);if(saved)return saved;const row=byId.get(id);if(!row||visiting.has(id))fail('portable predecessor missing/cyclic');visiting.add(id);
  try{const context=readPlaceActContext(row!.context,selected.inherited.clock),input:HostClockInput={store:'',selector:selected.selector,profileSelector:selected.profileSelector,history:row!.authority.history,anchor:expectedAnchor,algorithms:eraOf(foldClaims(row!.authority.history.filter(l=>fieldOf(l,'scope').startsWith('wire/'))).standing).admitted,legacyOriginals:row!.authority.history,authorityCheckpoint:row!.authority.checkpoint,resources:{bytes:selected.resources.bytes,lines:selected.resources.lines,places:selected.resources.places},inherited:selected.inherited,authenticatedReceiverHeads:[],readCurrent:()=>fail('portable inspection has no current Root authority'),historical:()=>fail('portable inspection uses declared predecessor graph')};
   const basic=hostClockSelection(input),heads=context.places.map(p=>{const initial=basic.trust.initialHeads.find(h=>h.place===p.place);if(initial?.identity===p.previous)return initial;const parent=inspect(p.previous),place=parent.context.places.find(one=>one.place===p.place);if(!place)fail('portable predecessor namespace');return{place:p.place,identity:p.previous,epoch:place!.epoch}});
   const contract=hostClockSelection({...input,authenticatedReceiverHeads:heads}).trust.contract,result=placeActReceiptsOf(row!.context,row!.receipts,contract);if(result.identity!==id)fail('portable identity differs');const value={contract,context};done.set(id,value);return value;
  }finally{visiting.delete(id)}
 };
 for(const id of byId.keys())inspect(id);
 return[...done].map(([identity,value])=>({identity,context:value.context}));
}

/** Prospective configuration is checked as authenticated Root history, never
 * against a prose birth condition. Initial heads are explicit typed selections;
 * stored committed chains cannot disappear when a selection is activated or
 * replaced. Preview reads only; the real admission repeats under its Root lock. */
export function assertProspectiveRootClockSelection(root:string,signed:readonly string[]):void{
 const sourceScope='wire/place-act-context-source';
 const before=admissionHistoryAt(root,Number.MAX_SAFE_INTEGER);
 const selectors=[sourceScope,'wire/place-act-context-selection','wire/place-act-context'];
 // Ordinary lots need no clock projection, including bootstrap before an
 // admission anchor exists. Raw stored delivery is not authenticated claims.
 if(!before.some(l=>fieldOf(l,'scope')===sourceScope)&&!signed.some(l=>selectors.includes(fieldOf(l,'scope'))))return;
 const oldLive=authenticatedRootStanding(root).filter(l=>fieldOf(l,'value')!=='withdraw');
 const oldMapping=oldLive.find(l=>fieldOf(l,'scope')===sourceScope&&fieldOf(l,'measure')==='text');
 if(oldMapping){const anchor=admissionAnchor(root),algorithms=eraOf(oldLive.filter(l=>fieldOf(l,'scope').startsWith('wire/'))).admitted;if(fieldOf(oldMapping,'by')!==anchor.id||!verifiesOwnerLine(oldMapping,anchor.publicKey,algorithms))fail('existing source mapping is not Root signed');let old:any;try{old=JSON.parse(fieldOf(oldMapping,'about'))}catch{return fail('existing source mapping JSON invalid')}selectors.push(old.selector,old.profileSelector);}
 if(!signed.some(l=>selectors.includes(fieldOf(l,'scope'))))return;
 if(signed.every(line=>before.includes(line)))return;
 const store=storeOf(root);if(!readOnly())rootAuthorityProtection(store);
 const history=[...new Set([...before,...signed])],live=foldClaims([...oldLive,...signed].filter(isConfig)).standing.filter(l=>fieldOf(l,'value')!=='withdraw'),rows=live.filter(l=>fieldOf(l,'scope')===sourceScope&&fieldOf(l,'measure')==='text');
 if(!rows.length){if(signed.some(l=>fieldOf(l,'scope')===sourceScope&&fieldOf(l,'value')==='withdraw'))return;return fail('activation requires source and selection together')}
 if(rows.length!==1)fail('prospective source mapping ambiguous');
 const line=rows[0]!,anchor=admissionAnchor(root),algorithms=eraOf(live.filter(l=>fieldOf(l,'scope').startsWith('wire/'))).admitted;
 if(fieldOf(line,'by')!==anchor.id||fieldOf(line,'role')!=='writes'||fieldOf(line,'form')!=='alphabet'||fieldOf(line,'value')!=='lock'||!verifiesOwnerLine(line,anchor.publicKey,algorithms))fail('prospective mapping is not Root signed');
 const about=fieldOf(line,'about');let selected:any;try{selected=JSON.parse(about)}catch{return fail('prospective source mapping JSON invalid')}
 if(!selected||Object.keys(selected).sort().join(',')!=='bootstrapCheckpoint,inherited,profile,profileSelector,resources,selector'||selected.profile!=='place-act-context@1'||JSON.stringify(selected)!==about)fail('unsupported prospective source mapping');sourceSelection(selected);
 const positive=(scope:string,measure:string)=>signed.filter(l=>fieldOf(l,'scope')===scope&&fieldOf(l,'measure')===measure&&fieldOf(l,'value')!=='withdraw');
 if(!oldMapping&&(positive(sourceScope,'text').length!==1||positive(selected.selector,'text').length!==1))fail('activation requires source and selection together');
 const checkpoint=signed.filter(isConfig).at(-1)??fail('prospective authority checkpoint absent');
 if(!oldMapping&&positive(selected.bootstrapCheckpoint.scope,selected.bootstrapCheckpoint.measure).length!==1)fail('initial authority checkpoint must land with selection');
 const old=oldMapping?declaredRootClockSource(root):undefined;
 const actualLegacy=[...new Set([...before,...placesIn(root).flatMap(place=>appliedHistoryIn(root,place))])];
 const observed={history,anchor,algorithms,authorityCheckpoint:checkpoint,legacyOriginals:actualLegacy};
 const resolved=hostClockSelection({store,selector:selected.selector,profileSelector:selected.profileSelector,...observed,resources:{bytes:selected.resources.bytes,lines:selected.resources.lines,places:selected.resources.places},inherited:selected.inherited,readCurrent:()=>observed,historical:encoded=>{if(!old)return fail('committed receiver history precedes initial selection');return old.trust.historical(encoded)}});
 const heads=placeActHeads(store,resolved.trust.initialHeads,resolved.trust,resolved.selection.storageBudget),expected=old?old.trust.current().heads:resolved.trust.initialHeads;
 for(const head of expected){const actual=heads.find(one=>one.place===head.place);if(!actual||actual.identity!==head.identity||actual.epoch!==head.epoch)fail('prospective selection resets committed receiver '+head.place)}
}
