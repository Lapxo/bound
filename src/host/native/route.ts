import{fieldNames}from'./reading.ts';
import {sha256 as hash} from '../hash.ts';
/** Instrument-only native route. The caller holds the existing Root lease
 * across selection, cache authorization and this complete bounded child act.
 */
import {dirname} from 'node:path';import{realpathSync}from'node:fs';import{nativeBinaryOrigin,type NativeBinaryOrigin}from'./native-binary.ts';
import{selectedHostControl,type HostControlSelection}from'./control-selection.ts';
import {authorityAtEpoch} from '@lapxo/topos/wire';
import {parsedLine as parse} from '../../fold/claims.ts';
import {authorityFor} from '../../fold/signers.ts';
import {authenticatedRootStanding} from '../admitted-place.ts';
import {nativeExecutorInputs} from './materialize.ts';
export {materializeNativeRoute} from './materialize.ts';
import {assertNativeRuntime} from './runtime.ts';
import {nativeReferenceInputs} from './references.ts';
import {rootAuthorityProtection} from '../../land/act.ts';
import {currentNativeRoot,inheritedNativeRoot} from './root.ts';
import {authenticateSignedPort,authenticateNativeProfile,canonicalJson,type PortProfile,type RootStanding} from './reading.ts';
import {boundedProcess} from '../process-lifetime.ts';
import {validResponse,CapsuleProcessError} from '../capsule-process.ts';
import {processOf} from '../../observe/runner.ts';
import type {ReadingExecution,ReadingReference} from '../reading-context.ts';
import type {Request,Response} from '@lapxo/topos/contract';
import type {ReaderLifetime} from '@lapxo/topos/wire';
import type {RootContext} from '@lapxo/topos/core';
const fail=(why:string):never=>{throw Error('REFUSE·native route '+why)};
export interface NativeBinaryBinding {readonly line:string;readonly coordinate:string;readonly profile:import('./native-binary.ts').NativeBinaryProfile;readonly origin?:NativeBinaryOrigin}
export interface NativeRoute {readonly identity:string;readonly profile:PortProfile;readonly binaries:readonly NativeBinaryBinding[];readonly control?:HostControlSelection;readonly inputs:readonly ReadingReference[]}
interface Held {store:string;coordinate:string;context:RootContext;profile:PortProfile}
const routes=new WeakMap<NativeRoute,Held>();
/** Shared origins are one exact input; individual signed selectors remain separate. */
export function nativeBinaryOriginInputs(binaries:readonly NativeBinaryBinding[]):readonly ReadingReference[]{
 const seen=new Map<string,string>(),inputs:ReadingReference[]=[];
 for(const binary of binaries){if(!binary.origin)continue;const coordinate='native/binary-origin/'+binary.origin.coordinate,digest=hash(binary.origin.line),prior=seen.get(coordinate);
  if(prior!==undefined){if(prior!==digest)fail('conflicting binary origin input '+coordinate);continue}
  seen.set(coordinate,digest);inputs.push([coordinate,digest]);
 }
 return Object.freeze(inputs);
}
/** Inputs are semantic logical references. Fixed instrument/host graph and
 * runtime-supervisor chain must also be supplied by the calling identity builder.
 * Locations and lock-token/PID are operational custody, never these inputs.
 */
export function prepareNativeRoute(store:string,coordinate:string,readerMapping?:string):NativeRoute{
 const proof=rootAuthorityProtection(store),current=currentNativeRoot(store,process.pid,proof);
 return prepareAtCurrentRoot(store,coordinate,readerMapping,current);
}
/** Private same-call reuse only: callers cannot supply a standing as authority. */
function prepareAtCurrentRoot(store:string,coordinate:string,readerMapping:string|undefined,current:ReturnType<typeof currentNativeRoot>):NativeRoute{
 const {root,context}=current,selected=authenticateNativeProfile(root,coordinate),profile=selected.profile;
 // The Root cursor authorizes today's act under the held lease. It is not a
 // semantic input to every program: unrelated Root acts do not reopen it.
 // Exact selected grants and the authenticated reader mapping remain inputs.
 const binaries=authenticatedNativeBinaries(root,profile),control=selectedHostControl(root,profile),identity=hash(canonicalJson([coordinate,selected.line,profile,binaries,readerMapping??null,...(control?[control]:[])])),inputs:ReadingReference[]=[['native/selection',identity],...(readerMapping?[['native/reader-mapping',hash(readerMapping)] as const]:[]),...profile.selection.members.map(m=>['native/'+m.coordinate,m.digest] as const),...binaries.map(b=>['native/binary/'+b.coordinate,hash(b.line)] as const)];
 inputs.push(...nativeBinaryOriginInputs(binaries));if(control)inputs.push(['native/control-profile',hash(control.line)],['native/control-worker',control.profile.worker.digest],['native/control-runtime',control.profile.runtime.digest]);const route={identity,profile,binaries,...(control?{control}:{}),inputs:inputs as readonly ReadingReference[]};routes.set(route,{store,coordinate,context,profile});inputs.push(...nativeExecutorInputs(route));if(control&&inputs.find(([name])=>name===control.profile.worker.coordinate)?.[1]!==control.profile.worker.digest)fail('control worker differs from sealed executor');Object.freeze(inputs);return Object.freeze(route);
}
/** Recheck authority before both a current retained answer and fresh execution.
 * Historical public --check uses the existing receipt-inspection path, not this
 * command authorization route.
 */
export function assertNativeRouteCurrent(route:NativeRoute):void{
 const held=routes.get(route);if(!held)return fail('unknown prepared route');
 const proof=rootAuthorityProtection(held.store),root=inheritedNativeRoot({store:held.store,parent:process.pid,expected:held.context},proof);
 const profile=authenticateSignedPort(root,held.coordinate).profile;
 if(canonicalJson(profile)!==canonicalJson(held.profile)||canonicalJson(authenticatedNativeBinaries(root,held.profile))!==canonicalJson(route.binaries)||canonicalJson(selectedHostControl(root,held.profile)??null)!==canonicalJson(route.control??null))fail('current port changed');
}
export function invokeNativeRoute(route:NativeRoute,input:{archive:string;locations:readonly {member:string;path:string;kind:'module'|'data'|'binary'}[];requests:readonly Request[];execution:ReadingExecution;limits:ReaderLifetime}):readonly Response[]{
 const held=routes.get(route);if(!held)return fail('unknown prepared route');assertNativeRouteCurrent(route);
 assertNativeRuntime(input.execution.env,input.execution.flags);
 if(input.execution.context.implementation!==held.profile.selection.archive)fail('reading implementation differs');
 nativeReferenceInputs(input.execution.context.inputs,route.inputs);
 if(input.limits.timeoutMs>held.profile.port.timeoutMs||input.limits.responseBytes>held.profile.port.responseBytes)fail('reader limits exceed current command grant');
 const proof=rootAuthorityProtection(held.store),frame={proof,archive:input.archive,locations:input.locations,requests:input.requests};
 const args=[processOf('native'),held.store,held.coordinate,JSON.stringify(held.context),'reserved',String(held.profile.selection.budget.bytes),'act',String(process.pid),JSON.stringify(input.execution)];
 const result=boundedProcess(process.execPath,args,JSON.stringify(frame),input.limits,input.execution.cwd,input.execution.env);
 if(result.signal!==null||result.status!==0)throw new CapsuleProcessError('native child exited '+String(result.status??result.signal),result);
 let values:unknown;try{values=JSON.parse(result.stdout.trimEnd())}catch{return fail('native child malformed batch')}
 if(!Array.isArray(values)||values.length!==input.requests.length||!values.every((value,index)=>validResponse(value,input.requests[index]!)))fail('native child invalid batch');
 assertNativeRouteCurrent(route);return values as readonly Response[];
}

/** This predicate only schedules an outer lease. It grants no command. */
export function declaredNativeReaderPorts(lines:readonly string[]):boolean{return lines.some(line=>{const got=parse(line);return got.kind==='fact'&&got.value.fields.scope.startsWith('reader/')&&got.value.fields.scope.split('/').at(-1)==='port'&&got.value.fields.value!=='withdraw'})}
export function prepareNativeReaderRoute(store:string,reader:{id:string;module:string}):NativeRoute|undefined{
 const expectedScope=['reader',reader.module,'port'].join('/');
 const declared=authenticatedRootStanding(dirname(store));if(!declared.some(line=>{const got=parse(line);return got.kind==='fact'&&got.value.fields.scope===expectedScope&&got.value.fields.value!=='withdraw'}))return undefined;
 const proof=rootAuthorityProtection(store),currentRoot=currentNativeRoot(store,process.pid,proof),root=currentRoot.root;
 const rows=root.live.filter(line=>{const got=parse(line);return got.kind==='fact'&&got.value.fields.scope===expectedScope});
 if(!rows.length)return undefined;if(rows.length!==1)fail('ambiguous reader port '+expectedScope);
 const got=parse(rows[0]!);if(got.kind!=='fact')return fail('invalid reader port '+expectedScope);const f=got.value.fields;
 if(f.role!=='writes'||f.form!=='alphabet'||f.measure!=='id'||typeof f.value!=='string'||!/^port\/[^\s]+$/.test(f.value))fail('malformed reader port '+expectedScope);
 const auth=authorityFor(root.history,root.signer,root.eras),signed=auth.of(rows[0]!);
 if(signed.kind!=='admitted'||signed.signer!==root.signer.id)fail('reader port is not Root signed '+expectedScope);
 if(signed.kind!=='admitted')return fail('reader port signature not admitted');const signer=auth.admitted.find(one=>one.id===signed.signer);if(!signer)return fail('reader port signer absent');
 const current=authorityAtEpoch(f,signer,root.epoch,expectedScope,'authority');if(current.kind!=='admitted')fail('reader port current eligibility '+current.why);
 return prepareAtCurrentRoot(store,f.value,rows[0]!,currentRoot);
}
export function nativeRouteStore(route:NativeRoute):string{const held=routes.get(route);if(!held)return fail('unknown prepared route');return held.store}

/** Quiet-pass gate: authenticate grants/cursor only, no image/materialization or
 * program execution. Historical --check remains its separate receipt path. */
export function assertNativeReaderGrantsCurrent(store:string):void{currentNativeReaderSelections(store);}

/** Executable kinds come only from current authenticated Root declarations. A
 * matching JSON hint identifies a candidate, but is never permission to execute. */
export function authenticatedNativeBinaries(root:RootStanding,profile:PortProfile):readonly NativeBinaryBinding[]{
 const out:NativeBinaryBinding[]=[],names=new Set<string>();const keys=fieldNames;
 for(const line of root.live){const row=parse(line);if(row.kind!=='fact'||!row.value.fields.scope.startsWith('port/'))continue;let hint:any;try{hint=JSON.parse(row.value.fields.about??'')}catch{continue}
  if(!['host-native-binary@1','host-native-binary-origin@1'].includes(hint?.profile)||hint.selector?.port!==profile.port.coordinate)continue;
  const coordinate=row.value.fields.scope,auth=authenticateSignedPort(root,coordinate),p=auth.profile as import('./native-binary.ts').NativeBinaryProfile;
  if(keys(p)!==(p.profile==='host-native-binary-origin@1'?'alias,condition,coordinate,entry,limits,origin,profile,selector':'alias,condition,coordinate,entry,limits,profile,selector')||p.coordinate!==coordinate||typeof p.alias!=='string'||!p.alias.length||p.alias.includes('\0')||typeof p.condition!=='string'||!p.condition.length||keys(p.selector??{})!=='binding,implementation,port'||p.selector.implementation!==profile.port.implementation||!profile.selection.bindings.some(b=>b.id===p.selector.binding))fail('binary declaration differs from selected parent '+coordinate);
  const entry=p.entry,member=profile.selection.members.find(m=>m.coordinate===entry?.path);
  if(keys(entry??{})!=='bytes,digest,path'||!member||entry.path===profile.selection.runtime||member.digest!==entry.digest||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||keys(p.limits??{})!=='bytes'||!Number.isSafeInteger(p.limits.bytes)||p.limits.bytes<entry.bytes||p.limits.bytes>profile.selection.budget.bytes)fail('binary outside selected image resources '+coordinate);
  if(names.has(coordinate))fail('ambiguous binary declaration '+coordinate);names.add(coordinate);if(entry.digest===profile.selection.members.find(m=>m.coordinate===profile.selection.runtime)?.digest)fail('binary aliases selected runtime');const origin=nativeBinaryOrigin(root,p,auth.line);if(origin?.path===realpathSync(process.execPath))fail('binary origin aliases actual runtime');out.push(Object.freeze({line:auth.line,coordinate,profile:p,...(origin?{origin}:{})}));
 }
 return Object.freeze(out);
}
/** Same semantic image identity for preparation, retained mount and quiet checks. */
export function nativeMountIdentity(profile:PortProfile,binaries:readonly NativeBinaryBinding[],control?:HostControlSelection):string{return hash(canonicalJson(['logical-native-image/2',profile.selection,binaries,...(control?[control]:[])]))}
export interface CurrentNativeReaderSelection {readonly profile:PortProfile;readonly binaries:readonly NativeBinaryBinding[];readonly control?:HostControlSelection}
/** Current eligibility only: no executor graph, image load or materialization. */
export function currentNativeReaderSelections(store:string):readonly CurrentNativeReaderSelection[]{
 const declared=authenticatedRootStanding(dirname(store));if(!declaredNativeReaderPorts(declared))return [];
 const proof=rootAuthorityProtection(store),currentRoot=currentNativeRoot(store,process.pid,proof),root=currentRoot.root;
 const mappings=root.live.flatMap(line=>{const row=parse(line);return row.kind==='fact'&&row.value.fields.scope.startsWith('reader/')&&row.value.fields.scope.split('/').at(-1)==='port'?[{line,fields:row.value.fields}]:[]});
 const seen=new Set<string>(),auth=authorityFor(root.history,root.signer,root.eras),out:CurrentNativeReaderSelection[]=[];
 for(const{line,fields:f}of mappings){if(seen.has(f.scope))fail('ambiguous reader port '+f.scope);seen.add(f.scope);
  if(f.role!=='writes'||f.form!=='alphabet'||f.measure!=='id'||typeof f.value!=='string'||!/^port\/[^\s]+$/.test(f.value))fail('malformed reader port '+f.scope);
  const signed=auth.of(line);if(signed.kind!=='admitted'||signed.signer!==root.signer.id)fail('reader port is not Root signed '+f.scope);if(signed.kind!=='admitted')return fail('reader mapping not admitted');
  const signer=auth.admitted.find(one=>one.id===signed.signer);if(!signer)return fail('reader mapping signer absent');const current=authorityAtEpoch(f,signer,root.epoch,f.scope,'authority');if(current.kind!=='admitted')fail('reader port current eligibility '+current.why);
  const {profile}=authenticateNativeProfile(root,f.value);const control=selectedHostControl(root,profile);out.push({profile,binaries:authenticatedNativeBinaries(root,profile),...(control?{control}:{})});
 }
 return out;
}
export function currentNativeReaderProfiles(store:string):readonly PortProfile[]{return currentNativeReaderSelections(store).map(selection=>selection.profile)}
