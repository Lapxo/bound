import {sha256 as hash} from '../hash.ts';
/** Host profile authentication and bounded executable input handoff. */
import{extname}from'node:path';
import{gunzipSync}from'node:zlib';
import{readBoundedFile}from'./bounded-file.ts';
import{members as archiveMembers}from'../archive.ts';
import{installBoundary}from'./loader.ts';
import{nativeRootJobCustody}from'./custody.ts';
import{mountNativeImage,type LogicalLoader}from'./image.ts';
import{createHash}from'node:crypto';
import{topos_wire_canonical as canonical}from"../../../vendor/library.js";
import{parsedLine as parse}from'../../fold/claims.ts';
import type{topos_wire_Signer as Signer}from"../../../vendor/library.js";
import{topos_contract_answer as answer}from"../../../vendor/library.js";
import type{topos_contract_Request as Request,topos_contract_Response as Response}from"../../../vendor/library.js";
import type{topos_capsule_Asked as Asked}from"../../../vendor/library.js";
import type{topos_contract_CommandPort as CommandPort}from"../../../vendor/library.js";
import{authorityFor}from'../../fold/signers.ts';
// Public SDK eligibility implementation; no private SDK module import.
import{topos_wire_authorityAtEpoch as authorityAtEpoch}from"../../../vendor/library.js";
import{scheduleDeadline}from'./deadline.ts';
import{prepareNodeImage,plannedJobs,executeJobs,type NodeImage,type CapturedCommand,type RootJobCustody}from'./node-jobs.ts';
import type{Handoff,Proposal}from'./jobs.ts';
const fail=(why:string):never=>{throw Error('REFUSE·native reading '+why)};
export const canonicalJson=(value:unknown):string=>JSON.stringify(order(value));
const order=(value:unknown):unknown=>Array.isArray(value)?value.map(order):value!==null&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,order(v)])):value;
export interface RootStanding {readonly history:readonly string[];readonly live:readonly string[];readonly signer:Signer;readonly eras:readonly string[];readonly epoch:number;readonly budget:{readonly lines:number;readonly bytes:number}}
export interface PortProfile {readonly profile:'host-native-reading@1';readonly port:CommandPort;readonly selection:{readonly archive:string;readonly entry:string;readonly reader:string;readonly loaderConfig:string;readonly runtime:string;readonly preload:string|null;readonly nativePreloadMembers:readonly string[];readonly condition:string;readonly budget:Handoff['budget'];readonly members:readonly {coordinate:string;digest:string}[];readonly bindings:Handoff['bindings'];readonly loads:Handoff['loads']}}
export interface NativeReadingModule {readonly commands?:(asked:Asked)=>readonly Proposal[];readonly receipt?:(asked:Asked)=>readonly unknown[];readonly render?:(asked:Asked)=>readonly string[]}
export interface NativeReadingHandle {readonly identity:string}
interface Prepared {root:RootStanding;coordinate:string;profile:PortProfile;image:ReturnType<typeof prepareNodeImage>;module:NativeReadingModule;custody?:RootJobCustody;loader?:Parameters<typeof installBoundary>[0]}
const prepared=new WeakMap<NativeReadingHandle,Prepared>();
export function authenticateSignedPort(root:RootStanding,coordinate:string):{line:string;profile:unknown}{
 if(!root||!Number.isSafeInteger(root.epoch)||root.epoch<0||!Number.isSafeInteger(root.budget?.lines)||root.budget.lines<1||!Number.isSafeInteger(root.budget.bytes)||root.budget.bytes<1)fail('missing authority/budget');
 const retained=[...new Set([...root.history,...root.live])];if(retained.length>root.budget.lines)fail('authority line budget');let bytes=0;for(const line of retained){if(typeof line!=='string'||(bytes+=Buffer.byteLength(line))>root.budget.bytes)fail('authority byte budget')}
 if(!/^port\/[^\s]+$/.test(coordinate))fail('selection is not a command port');
 const rows=root.live.filter(line=>{const got=parse(line);return got.kind==='fact'&&got.value.fields.scope===coordinate});if(rows.length!==1)fail('missing/ambiguous signed declaration '+coordinate);
 const line=rows[0]!;if(!root.history.includes(line))fail('port absent from authenticated admission history');
 const got=parse(line);if(got.kind!=='fact')return fail('port not a wire record');const f=got.value.fields;
 if(f.role!=='writes'||f.form!=='alphabet'||f.measure!=='text'||f.value!=='lock'||typeof f.about!=='string')fail('unknown port projection '+coordinate);
 const auth=authorityFor(root.history,root.signer,root.eras),verdict=auth.of(line);if(verdict.kind!=='admitted')fail('port signature/coverage '+verdict.why);
 const signerId=verdict.kind==='admitted'?verdict.signer:fail('signature not admitted');const signers=auth.admitted.filter(s=>s.id===signerId);if(signers.length!==1)fail('ambiguous port signer');
 if(root.history.some(line=>{const p=parse(line);return p.kind==='fact'&&p.value.fields.epoch!==undefined&&(!Number.isSafeInteger(Number(p.value.fields.epoch))||Number(p.value.fields.epoch)>root.epoch)}))fail('authority prefix exceeds current epoch');
 const current=authorityAtEpoch(f,signers[0]!,root.epoch,coordinate,'authority');if(current.kind!=='admitted')fail('current port authority '+current.why);
 let value:unknown;try{value=JSON.parse(f.about)}catch{return fail('port JSON invalid')}
 if(!value||typeof value!=='object'||Array.isArray(value)||canonicalJson(value)!==f.about)fail('port profile invalid/noncanonical');return{line,profile:value};
}
function selected(root:RootStanding,coordinate:string):{line:string;profile:PortProfile}{const got=authenticateSignedPort(root,coordinate),profile=got.profile as PortProfile;const line=got.line;
 if(!profile.port||!profile.selection||typeof profile.selection!=='object'||Array.isArray(profile.selection))fail('missing native selection');
 if(Object.keys(profile.selection).sort().join(',')!=='archive,bindings,budget,condition,entry,loaderConfig,loads,members,nativePreloadMembers,preload,reader,runtime')fail('unknown native selection field');
 if(Object.keys(profile).sort().join(',')!=='port,profile,selection'||profile.profile!=='host-native-reading@1'||profile.port?.coordinate!==coordinate)fail('unknown/noncanonical native profile');
 return {line,profile};
}
export interface AuthenticatedNativeSelection {readonly identity:string}
const selections=new WeakMap<AuthenticatedNativeSelection,{root:RootStanding;coordinate:string;profile:PortProfile}>();
/** This is the BEFORE-LOAD boundary. It authenticates the actual signed profile
 * and checks current authority; a packet cannot mint the opaque result. */
function freezeProfile<T>(value:T):T{if(value!==null&&typeof value==='object'){for(const child of Object.values(value))freezeProfile(child);Object.freeze(value)}return value;}
function holdSelection(root:RootStanding,coordinate:string,selection:{line:string;profile:PortProfile}):AuthenticatedNativeSelection{const handle=Object.freeze({identity:hash(canonicalJson([selection.line,root.epoch]))});selections.set(handle,{root:{...root,history:[...root.history],live:[...root.live],eras:[...root.eras],budget:{...root.budget}},coordinate,profile:freezeProfile(selection.profile)});return handle;}
/** One synchronous authentication supplies both the opaque boundary and its
 * immutable signed profile. Fresh Root checks still run at load and answer. */
export function authenticateNativeProfile(root:RootStanding,coordinate:string):{readonly selection:AuthenticatedNativeSelection;readonly line:string;readonly profile:PortProfile}{const got=selected(root,coordinate),selection=holdSelection(root,coordinate,got);return Object.freeze({selection,line:got.line,profile:got.profile});}
export function validateSignedNativeProfile(root:RootStanding,coordinate:string,expected:PortProfile):AuthenticatedNativeSelection{const got=selected(root,coordinate);if(canonicalJson(got.profile)!==canonicalJson(expected))fail('expected profile differs from signature');return holdSelection(root,coordinate,got);}

/** Root supplies an authenticated current standing and its selected exact image.
 * The signature authenticates the ENTIRE profile JSON including its selection;
 * matching resolved selection is checked byte-for-byte, never from world data.
 * The real Root guard constructor remains a host-integration prerequisite. */
function prepareSignedNativeReading(root:RootStanding,coordinate:string,resolved:{profile:PortProfile;handoff:Handoff;image:NodeImage;module:NativeReadingModule;archive:Uint8Array}):NativeReadingHandle{
 const selection=selected(root,coordinate);if(canonicalJson(selection.profile)!==canonicalJson(resolved.profile))fail('resolved image/profile differs from signed selection');
 if(!(resolved.archive instanceof Uint8Array)||resolved.archive.byteLength>resolved.handoff.budget.bytes)fail('archive exceeds declared input budget');
 let entries:ReturnType<typeof archiveMembers>;try{gunzipSync(resolved.archive,{maxOutputLength:resolved.handoff.budget.bytes});entries=archiveMembers(resolved.archive)}catch{return fail('native implementation archive invalid')}const entriesAt=entries.filter(e=>e.name===resolved.profile.selection.entry);if(entriesAt.length!==1||'sha256:'+createHash('sha256').update(entriesAt[0]!.bytes).digest('hex')!==resolved.profile.port.implementation)fail('archive native entry differs from implementation');
 const computedSelection={archive:'sha256:'+createHash('sha256').update(resolved.archive).digest('hex'),entry:resolved.profile.selection.entry,reader:resolved.profile.selection.reader,loaderConfig:resolved.profile.selection.loaderConfig,runtime:resolved.image.runtime,preload:resolved.image.preload??null,nativePreloadMembers:resolved.image.nativePreloadMembers,condition:resolved.image.condition,budget:resolved.handoff.budget,members:resolved.handoff.members.map(({coordinate,digest})=>({coordinate,digest})),bindings:resolved.handoff.bindings,loads:resolved.handoff.loads};
 if(canonicalJson(computedSelection)!==canonicalJson(resolved.profile.selection))fail('resolved host bindings differ from signed selection');
 if(resolved.profile.port.implementation!==resolved.handoff.members.find(m=>m.coordinate===resolved.profile.selection.entry)?.digest)fail('native implementation differs from handed member');
 if(resolved.handoff.bindings.some(b=>b.limits.slots!==resolved.handoff.bindings[0]!.limits.slots))fail('native bindings need one declared parent slots resource');
 if(!Number.isSafeInteger(resolved.profile.port.timeoutMs)||resolved.profile.port.timeoutMs<1||!Number.isSafeInteger(resolved.profile.port.responseBytes)||resolved.profile.port.responseBytes<1)fail('missing parent time/bytes');
 const declared=resolved.profile.port;if(Object.keys(declared).sort().join(',')!=='closure,coordinate,environment,implementation,responseBytes,stderr,timeoutMs'||declared.stderr!=='reject'||new Set(declared.closure).size!==declared.closure.length||canonicalJson([...declared.closure].sort())!==canonicalJson([...new Set(resolved.handoff.members.map(m=>m.digest))].sort())||resolved.handoff.bindings.some(b=>canonicalJson(b.environment.map(([name])=>name).sort())!==canonicalJson([...declared.environment].sort())))fail('command resource/environment/closure projection differs');
 const authorityIdentity=hash(canonicalJson([root.signer.id,root.signer.publicKey,root.eras,root.epoch,root.history,root.live]));
 const contextualHandoff={...resolved.handoff,authoritySnapshot:authorityIdentity,policy:hash(canonicalJson([resolved.handoff.policy,selection.line,authorityIdentity]))};
 const image=prepareNodeImage(contextualHandoff,{...resolved.image,commandPort:declared}),handle=Object.freeze({identity:hash(canonicalJson([selection.line,root.epoch,image.identity]))});
 prepared.set(handle,{root:{...root,history:[...root.history],live:[...root.live],eras:[...root.eras],budget:{...root.budget}},coordinate,profile:selection.profile,image,module:Object.freeze({...resolved.module})});return handle;
}
/** Root must hold its real authority protection across the callback. A guard
 * method is instrument code, never supplied by a command or its JSON profile. */
export interface RootAuthorityGuard {withCurrent<T>(body:(root:RootStanding)=>Promise<T>):Promise<T>}

/** Fixed instrument loader, never a callback supplied by module/request/profile.
 * Root's REAL await-safe lease must cover verification, load and completion.
 * The handoff image is verified before the fixed loader receives an entry. */
export async function loadSignedNativeReading(selection:AuthenticatedNativeSelection,resolved:{profile:PortProfile;handoff:Handoff;image:NodeImage;archive:Uint8Array;custody?:RootJobCustody},guard:RootAuthorityGuard):Promise<NativeReadingHandle>{
 const held=selections.get(selection);if(!held)return fail('unknown pre-load selection');
 return guard.withCurrent(async current=>{
  const fresh=selected(current,held.coordinate);if(current.epoch!==held.root.epoch||canonicalJson(fresh.profile)!==canonicalJson(held.profile)||canonicalJson(current.history)!==canonicalJson(held.root.history))fail('authority changed before load');
  // Validate the exact entire image/profile FIRST, without importing reader code.
  prepareSignedNativeReading(current,held.coordinate,{...resolved,module:{}});
  const reader=resolved.image.locations.find(l=>l.member===held.profile.selection.reader),config=resolved.handoff.members.find(m=>m.coordinate===held.profile.selection.loaderConfig),location=resolved.image.locations.find(l=>l.member===held.profile.selection.loaderConfig);
  if(!reader||reader.kind!=='module'||!config||!location||!held.profile.selection.nativePreloadMembers.includes(config.coordinate))return fail('reader/config not selected');
  const raw=readBoundedFile(location.path,resolved.handoff.budget.bytes,held.profile.selection.loaderConfig);if(hash(raw.toString('utf8'))!==config.digest)fail('loader configuration changed');let declared:any;try{declared=JSON.parse(raw.toString('utf8'))}catch{return fail('loader configuration invalid')}
  const logical=declared as LogicalLoader;
  if(logical.platform!==resolved.image.condition)fail('selected runtime condition differs from logical platform');
  if(!Array.isArray(logical.members)||logical.members.some(m=>resolved.handoff.members.find(member=>member.coordinate===m.coordinate)?.digest!==m.digest))fail('loader target not covered by exact signed image');
  const mounted=mountNativeImage(logical,resolved.image.locations.filter(location=>logical.members.some(member=>member.coordinate===location.member)).map(location=>({coordinate:location.member,path:location.path})),held.profile.selection.reader,resolved.handoff.budget);
  const boundary=installBoundary(mounted.declaration);
  try{const module=await boundary.loadEntry();boundary.assertClosed();const ready=prepareSignedNativeReading(current,held.coordinate,{...resolved,image:{...resolved.image,hostLoader:{...mounted,preload:new URL('./preload'+extname(new URL(import.meta.url).pathname),import.meta.url).href}},module});prepared.get(ready)!.loader=mounted.declaration;prepared.get(ready)!.custody=resolved.custody??nativeRootJobCustody(current,resolved.profile,resolved.handoff,resolved.image,logical);return ready}finally{boundary.close()}
 });
}

export async function answerNativeReading(handle:NativeReadingHandle,requests:readonly Request[],self:string,options:{phase:'act'|'selection'|'help'|'check'|'preview'|'sign';signal?:AbortSignal;guard:RootAuthorityGuard}):Promise<readonly Response[]>{
 const held=prepared.get(handle);if(!held)return fail('unknown instrument selection');if(options.phase!=='act')fail('effects forbidden during '+options.phase);
 if(options.signal?.aborted)fail('interrupted before wrapper');
 const deadline=process.hrtime.bigint()+BigInt(held.profile.port.timeoutMs)*1_000_000n,controller=new AbortController(),abort=controller.abort.bind(controller,undefined),cancel=scheduleDeadline(deadline,abort);options.signal?.addEventListener('abort',abort,{once:true});
 try{return await options.guard.withCurrent(async current=>{
  const fresh=selected(current,held.coordinate);if(canonicalJson(fresh.profile)!==canonicalJson(held.profile)||current.epoch!==held.root.epoch||hash(canonicalJson(current.history))!==hash(canonicalJson(held.root.history)))fail('authority changed since preparation');
  if(!held.loader)return fail('reader not loaded by fixed host boundary');const boundary=installBoundary(held.loader);try{
  const frames:{request:Request;asked?:Asked;jobs:readonly Proposal[]}[]=requests.map(request=>{let asked:Asked|undefined;if(request.verb==='read'&&held.module.commands){const extraction=answer({receipt:a=>{asked=a;return[]}},request,self);if(extraction.kind!=='fact'||!asked)fail('Asked extraction refused');}const jobs=asked?held.module.commands!(asked):[];return{request,asked,jobs}});
  const jobs=frames.flatMap(f=>f.jobs),frame=new TextEncoder().encode(JSON.stringify(jobs)),wanted=plannedJobs(held.image,frame),observations=jobs.length?await executeJobs(held.image,frame,{phase:'act',signal:controller.signal,custody:held.custody}):[];
  if(observations.length!==wanted.length||observations.some((got,i)=>got.id!==wanted[i]!.id||got.identity!==wanted[i]!.identity||got.responses.length!==1))fail('capture identity/count differs');
  const rows=new Map(observations.map(got=>[got.id,got]));if(rows.size!==observations.length)fail('duplicate capture');
  // Capture text is witness provenance, not a new conceptual origin. Actual
  // Topos answer performs its normal handed(reads,lines) projection both times.
  const results=frames.map(({request,jobs})=>{const captures=jobs.map(job=>{const got=rows.get(job.id);if(!got)return fail('missing capture '+job.id);return canonical({scope:'command/capture/'+job.id,shape:'same',role:'reads',form:'alphabet',measure:'text',value:'lock',by:'host',at:'witness:'+got.identity,about:JSON.stringify({identity:got.identity,responses:got.responses})})});return answer(held.module,{...request,lines:[...(request.lines??[]),...captures]},self)});
  if(results.length!==requests.length)return fail('incomplete pure response');if(controller.signal.aborted||process.hrtime.bigint()>=deadline)fail('interrupted/timeout wrapper');if(Buffer.byteLength(JSON.stringify(results))>held.profile.port.responseBytes)fail('parent response bytes exceeded');boundary.assertClosed();return results;}finally{boundary.close()}
 });}finally{cancel();options.signal?.removeEventListener('abort',abort)}
}

/** Executable resources belong to the currently authenticated parent command
 * declaration, not to the separate authority-history/clock parsing budget. */
export function nativeParentInputBytes(root:RootStanding,parent:{port:string}):number{
 const selected=authenticateSignedPort(root,parent.port).profile as PortProfile;
 const bytes=selected?.selection?.budget?.bytes;if(selected?.profile!=='host-native-reading@1'||!Number.isSafeInteger(bytes)||bytes<1)fail('parent executable input resource absent');return bytes;
}

/** Exact schema field names, shared by the host's selected native formats. */
export function fieldNames(value:object):string{return Object.keys(value).sort().join(',');}
/** Retain each verifier's private map and return a fresh canonical projection. */
export function retainedProjection<H extends object,T>(verified:WeakMap<H,T>,fail:(why:string)=>never):(handle:H)=>T{
 return handle=>{const p=verified.get(handle);if(!p)return fail('unknown verified selection');return JSON.parse(canonicalJson(p))};
}
