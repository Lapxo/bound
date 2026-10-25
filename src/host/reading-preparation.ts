import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {canonical,parse,PROTOCOL,byBytes} from '@lapxo/topos/wire';
import type {ReaderLifetime,ReaderReference} from '@lapxo/topos/wire';
import type {Capsule} from './capsule.ts';
import {replaceWhole,shardLines} from '../land/ledger.ts';
import {fieldOf} from '../fold/claims.ts';
import {readingIdentityBytes,readingReceiptIdentity,responseIdentity,snapshotAccess,placeInputs,withPlaceInputs} from '@lapxo/topos/contract';
import type {ReadingIdentityContext,Snapshot,ResponseContext} from '@lapxo/topos/contract';
import {withReadingBoundary} from './reading-context.ts';
import type {ReadingExecution,ReadingReference} from './reading-context.ts';
import {BoundRefusal} from './refusals.ts';
export interface CurrentReading {readonly snapshot:Snapshot;readonly kept:ResponseContext;readonly current:ResponseContext;readonly permission:Parameters<typeof snapshotAccess>[3]}
import type {ReadingPreparationLimits,ReadingPreparationResult,PreparedReading} from './reading-identity-types.ts';
export type {ReadingPreparationLimits,ReadingPreparationResult,PreparedReading} from './reading-identity-types.ts';
export type ReadingFile={readonly place:string;readonly text:string};
export type ReadingPlan={scope:string;inputs:readonly string[];needs:readonly string[];resolution:number;line:string};
type Plan=ReadingPlan;
export interface ReadingClosureOptions {root:string;store:string;reader:string;speaker:string;digest:(text:string)=>string;capsule:Capsule;region:string;projection:string;readerReference?:ReaderReference;lifetime?:ReaderLifetime;allowsEmpty?:boolean;context?:ReadingIdentityContext;execution?:ReadingExecution;current?:CurrentReading;files:readonly ReadingFile[];livePlace?:()=>readonly string[];assertCurrent?:()=>void;emit?:(line:string)=>void;preparationLimits?:ReadingPreparationLimits}
type Result={digest:string;lines:readonly string[]};
class ReadingNeeds extends Error {readonly coordinates:readonly string[];constructor(coordinates:readonly string[]){super('Reading inputs missing');this.coordinates=coordinates;}}
const filesBytes=(files:readonly ReadingFile[])=>files.reduce((sum,file)=>sum+Buffer.byteLength(file.text,'utf8'),0);
export const readingFields=(line:string)=>{const got=parse(line);if(got.kind!=='fact')throw Error('REFUSE·input projection contains a non-wire line');return got.value.fields;};
export const inputLines=(files:readonly ReadingFile[]):readonly string[]=>files.map(file=>canonical({scope:file.place,form:'alphabet',measure:'text',role:'writes',value:'lock',shape:file.place,about:file.text,by:'host',at:'policy:handed-input'}));
/** The same preparation and retained-carrier checks serve execution and public inspection. */
export function readingPreparation(options:ReadingClosureOptions){
 const limits=options.preparationLimits;
 if(limits){for(const value of [limits.bytes,limits.files,limits.readings,limits.probes])if(!Number.isSafeInteger(value)||value<1)throw new BoundRefusal('host/budget','REFUSE·host/budget');if(filesBytes(options.files)>limits.bytes||options.files.length>limits.files||limits.probes<1)throw new BoundRefusal('host/budget','REFUSE·host/budget');}
 const {root,store,speaker,digest:hash,capsule,region,projection,files}=options;
 options.assertCurrent?.();
 if(options.context)readingIdentityBytes(options.context);
 let access:readonly ReadingReference[]=[];
 if(options.current){
  if(!options.context)throw Error('REFUSE·current reading requires a declared identity');
  const {snapshot,kept,current,permission}=options.current;
  if(current.implementation!==options.context.implementation)throw Error('REFUSE·current reading implementation differs from its verified context');
  const response=responseIdentity(snapshot,current,hash),allowed=snapshotAccess(snapshot,kept,current,permission,hash);
  if(!allowed.inspect||!allowed.reuse)throw Error('REFUSE·current reading is not admitted for reuse');
  access=[['response',response],['permission',hash(JSON.stringify([permission.inspect,permission.reuse,permission.freshness]))]];
 }
 if(options.execution&&(!options.context||JSON.stringify(readingIdentityBytes(options.execution.context))!==JSON.stringify(readingIdentityBytes(options.context))))throw Error('REFUSE·reading execution differs from declared context');
 const projectionFor=(name:string)=>{
  if(!capsule.selectedWorld)return undefined;
  const {standing,offer}=capsule.selectedWorld;
  const selectors=standing.parts.some(part=>part.scope===`${offer}/place-inputs/${name}`&&part.measure==='reads');
  if(!selectors)return undefined;
  if(!options.context||!options.execution||!options.livePlace)throw Error('REFUSE·place inputs require authenticated shadow and reading context '+name);
  return placeInputs(standing,offer,name,options.livePlace(),bytes=>hash(new TextDecoder().decode(bytes)));
 };
 const projectedPlace=projectionFor(projection),readingPlace=projectionFor(region);
 const commit=(context:ReadingIdentityContext|undefined,name:string,place:ReturnType<typeof placeInputs>)=>place&&context?withPlaceInputs(context,JSON.stringify(['place-inputs',capsule.selectedWorld!.offer,name]),place):context;
 const ask=(identity:string,requests:Parameters<Capsule['ask']>[0],context=options.context)=>withReadingBoundary(identity,options.execution&&context?{...options.execution,context}:options.execution,()=>capsule.ask(requests,options.readerReference));
 const projectionContext=commit(options.context,projection,projectedPlace);
 const base=projectionContext?hash(new TextDecoder().decode(readingIdentityBytes(projectionContext))):'';
 const algorithm=hash('').split(':')[0]!,handed=new Map(files.map(file=>[file.place,file.text]));
 if(handed.size!==files.length)throw Error('REFUSE·input projection has duplicate handed coordinates');
 const verify=()=>{if(limits?.signal?.aborted)throw new BoundRefusal('host/cancelled','REFUSE·host/cancelled');for(const file of files){if(!existsSync(join(root,file.place)))throw new ReadingNeeds([file.place]);if(!readFileSync(join(root,file.place)).equals(Buffer.from(file.text)))throw new BoundRefusal('reading-identity/integrity','REFUSE·input changed '+file.place);}};
 verify();
 if(limits?.signal?.aborted)throw new BoundRefusal('host/cancelled','REFUSE·host/cancelled');
 const projected=ask(base,[{...(projectedPlace?{place:projectedPlace}:{}),protocol:PROTOCOL,verb:'render',rootScope:'',region:projection,at:1,reads:['**'],lines:inputLines(files),files:[]}],projectionContext)[0];
 if(projected?.kind!=='fact'||!Array.isArray(projected.lines))throw Error('REFUSE·input projection '+(projected?.why??'no lines'));
 if(limits&&projected.lines.length>limits.readings)throw new BoundRefusal('host/budget','REFUSE·host/budget');
 const plans=new Map<string,Plan>();
 for(const line of projected.lines){const f=readingFields(line),scope=f.scope??'',resolution=/^receipt:(\d+)$/.exec(f.at??'');
  if(!scope||plans.has(scope)||f.form!=='alphabet'||f.measure!=='reads'||f.role!=='reads'||!resolution)throw Error('REFUSE·input projection ambiguous reading '+scope);
  const inputs=(f.value??'').split('|').filter(Boolean),needs=(f.needs??'').split('|').filter(Boolean);
  // An aggregate reads its declared receipts; it need not reread a leaf file.
  if((!inputs.length&&!needs.length)||new Set(inputs).size!==inputs.length||inputs.some(input=>!handed.has(input))||new Set(needs).size!==needs.length)throw Error('REFUSE·input projection has unhanded or duplicate dependencies '+scope);
  const n=Number(resolution[1]);if(!Number.isSafeInteger(n))throw Error('REFUSE·input projection invalid resolution '+scope);
  plans.set(scope,{scope,inputs,needs,resolution:n,line:canonical({scope,form:f.form,measure:f.measure,role:f.role,value:inputs.join('|'),needs:needs.join('|'),at:f.at})});
 }
 if(!plans.size)throw Error('REFUSE·input projection returned no readings');
 const ordered:Plan[]=[],visiting=new Set<string>(),done=new Set<string>();
 const visit=(scope:string)=>{if(done.has(scope))return;if(visiting.has(scope))throw Error('REFUSE·input projection dependency cycle '+scope);const p=plans.get(scope);if(!p)throw Error('REFUSE·input projection missing reading '+scope);visiting.add(scope);for(const need of p.needs)visit(need);visiting.delete(scope);done.add(scope);ordered.push(p);};
 for(const scope of plans.keys())visit(scope);
 const identity=hash([capsule.selection??'',capsule.digest,region,projection,...(options.lifetime===undefined?[]:[JSON.stringify(options.lifetime)])].join('\n')),by=speaker+':'+identity.split(':')[1]!.slice(0,12),journal='reading-closures/'+identity.split(':')[1];
 const prior=shardLines(store,speaker,journal);
 const carried=(digest:string)=>join(store,'cas','carried',digest.split(':')[1]??'');
 const saved=(text:string)=>{const digest=hash(text),path=carried(digest);mkdirSync(dirname(path),{recursive:true});if(!existsSync(path)||hash(readFileSync(path,'utf8'))!==digest)replaceWhole(path,text);return digest;};
 const load=(digest:string,strict=false)=>{if(!digest.startsWith(algorithm+':')||! /^[a-f0-9]+$/.test(digest.split(':')[1]??''))return;const path=carried(digest);if(!existsSync(path))return;const text=readFileSync(path,'utf8');if(hash(text)!==digest){if(strict)throw new BoundRefusal('reading-identity/integrity','REFUSE·reading carrier bytes differ');return undefined;}return text;};
 const prepare=(plan:Plan,results:ReadonlyMap<string,Result>)=>{
  const legacyClosure=[plan.line,canonical({scope:'implementation',role:'writes',form:'alphabet',measure:'digest',value:identity,by:'host',at:'policy:input-identity'}),...plan.inputs.map(input=>canonical({scope:input,role:'writes',form:'alphabet',measure:'digest',value:hash(handed.get(input)!),by:'host',at:'policy:input-identity'})),...plan.needs.map(need=>canonical({scope:need,role:'writes',form:'alphabet',measure:'digest',value:results.get(need)!.digest,by:'host',at:'policy:input-identity'}))].sort(byBytes).join('\n')+'\n';
  const leafContext=commit(options.context,region,readingPlace);
  const context=leafContext&&{...leafContext,policy:hash(JSON.stringify([leafContext!.policy,options.allowsEmpty===true,options.lifetime??null,options.readerReference??null,capsule.selection??null,capsule.lines])),inputs:[...[...leafContext!.inputs,...access].map(([name,digest])=>[JSON.stringify(['context',name]),digest] as const),[JSON.stringify(['plan']),hash(plan.line)] as const,...plan.inputs.map(input=>[JSON.stringify(['file',input]),hash(handed.get(input)!)] as const),...plan.needs.map(need=>[JSON.stringify(['receipt',need]),results.get(need)!.digest] as const)]};
  const closure=context?new TextDecoder().decode(readingIdentityBytes(context)):legacyClosure;
  const input=hash(closure),scope='receipts/readings/'+hash(plan.scope).split(':')[1]+'/'+input.split(':')[1];
  return {context,closure,input,scope};
 };
 const retained=(prepared:ReturnType<typeof prepare>,strict=false)=>{
  const {scope,input,closure}=prepared;
  const matching=prior.filter(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'measure')==='bytes'&&fieldOf(line,'value')===input).at(-1);
  const count=matching&&prior.filter(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'measure')==='count'&&fieldOf(line,'by')===by).at(-1);
  const heldOutput=count&&load(fieldOf(count,'at').replace(/^place:/,''),strict);
  const heldLines=heldOutput?.split('\n').filter(Boolean);
  const output=heldLines!==undefined&&fieldOf(count!,'value')===`${heldLines.length}..${heldLines.length}`&&heldLines.every(line=>{const f=readingFields(line);return f.by===by&&f.at==='place:'+input;})?heldOutput:undefined;
  if(output===undefined||load(input,strict)!==closure)return undefined;
  if(output===''&&!options.allowsEmpty)throw Error('REFUSE·reading empty response is not admitted');
  const lines=output.split('\n').filter(Boolean);for(const line of lines)readingFields(line);
  const payload=fieldOf(count!,'at').replace(/^place:/,'');
  return {lines,payload,digest:prepared.context?readingReceiptIdentity(input,payload,bytes=>hash(new TextDecoder().decode(bytes))):payload};
 };
 verify();return {ordered,identity,by,journal,prior,prepare,retained,verify,ask,load,saved,handed,readingPlace,verifiedBytes:filesBytes(files)};
}

/** Resolves only the declared input projection; never invokes a final read or writes its receipt. */
export function prepareReadingIdentities(options:ReadingClosureOptions & {readonly preparationLimits:ReadingPreparationLimits}):ReadingPreparationResult {
 try {
  if(!options.context||!options.execution)throw new BoundRefusal('reading-identity/context','REFUSE·reading preparation requires its actual execution context');
  const prepared=readingPreparation(options),results=new Map<string,Result>(),readings:PreparedReading[]=[];let retained=0;
  for(const plan of prepared.ordered){
   options.assertCurrent?.();prepared.verify();
   const missing=plan.needs.filter(need=>!results.has(need));
   if(missing.length){readings.push({scope:plan.scope,kind:'needs',needs:missing});continue;}
   const identity=prepared.prepare(plan,results),held=prepared.retained(identity,true);
   if(held){results.set(plan.scope,held);retained++;}
   readings.push({scope:plan.scope,kind:'ready',identity:identity.input,context:identity.context!,...(held?{receipt:held.digest}:{})});
  }
  prepared.verify();options.assertCurrent?.();return {kind:'fact',readings,probes:1,verifiedBytes:prepared.verifiedBytes,retained};
 }catch(error){if(error instanceof ReadingNeeds)return {kind:'needs',needs:error.coordinates};return {kind:'refuse',code:error instanceof BoundRefusal?error.code:'reading-identity/failed',diagnostic:error instanceof Error?error.message:'REFUSE·reading preparation failed'};}
}
