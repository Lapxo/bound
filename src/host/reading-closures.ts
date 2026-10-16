import {actCosts} from './act-cost.ts';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {canonical,parse,PROTOCOL,byBytes} from '@lapxo/topos/wire';
import type {ReaderLifetime,ReaderReference} from '@lapxo/topos/wire';
import type {Capsule} from './capsule.ts';
import {replaceWhole,landShard,shardLines} from '../land/ledger.ts';
import {fieldOf} from '../fold/claims.ts';
import {readOnly} from './read-only.ts';
import {readingIdentityBytes,readingReceiptIdentity,responseIdentity,snapshotAccess,placeInputs,withPlaceInputs} from '@lapxo/topos/contract';
import type {ReadingIdentityContext,Snapshot,ResponseContext} from '@lapxo/topos/contract';
import {withReadingBoundary} from './reading-context.ts';
import type {ReadingExecution,ReadingReference} from './reading-context.ts';

export interface CurrentReading {readonly snapshot:Snapshot;readonly kept:ResponseContext;readonly current:ResponseContext;readonly permission:Parameters<typeof snapshotAccess>[3]}
type File={readonly place:string;readonly text:string};
type Plan={scope:string;inputs:readonly string[];needs:readonly string[];resolution:number;line:string};
const receiptScope=(scope:string):string=>[scope,'identity'].join('/');
const fields=(line:string)=>{const got=parse(line);if(got.kind!=='fact')throw Error('REFUSE·input projection contains a non-wire line');return got.value.fields;};
export const inputLines=(files:readonly File[]):readonly string[]=>files.map(file=>canonical({scope:file.place,form:'alphabet',measure:'text',role:'writes',value:'lock',shape:file.place,about:file.text,by:'host',at:'policy:handed-input'}));
/** One portable native receipt carrier shared by file plans and native capsule batches. */
export function portableReadingReceipt(scope:string,by:string,closure:string,output:string,hash:(text:string)=>string,modern=true,costs:readonly string[]=[]):readonly string[]{
 const input=hash(closure),payload=hash(output),rows=output.split('\n').filter(Boolean);
 return [...(modern?[canonical({scope:receiptScope(scope),role:'writes',form:'alphabet',measure:'digest',value:readingReceiptIdentity(input,payload,bytes=>hash(new TextDecoder().decode(bytes))),by,at:'place:'+input})]:[]),canonical({scope,role:'writes',form:'alphabet',measure:'observed',value:payload,by,at:'place:'+payload}),canonical({scope,role:'writes',form:'alphabet',measure:'bytes',value:input,by,at:'place:'+input,about:closure}),canonical({scope,role:'writes',form:'interval',measure:'count',value:`${rows.length}..${rows.length}`,by,at:'place:'+payload,about:output}),...costs];
}

/** The selected world owns input projection and reading. The host only verifies closures and keeps native count/bytes receipts. */
export function readingClosures(options:{root:string;store:string;reader:string;speaker:string;digest:(text:string)=>string;capsule:Capsule;region:string;projection:string;readerReference?:ReaderReference;lifetime?:ReaderLifetime;allowsEmpty?:boolean;context?:ReadingIdentityContext;execution?:ReadingExecution;current?:CurrentReading;files:readonly File[];livePlace?:()=>readonly string[];assertCurrent?:()=>void;emit?:(line:string)=>void}):{lines:readonly string[];read:number;opened:number;executed:number}{
 const {root,store,reader,speaker,digest:hash,capsule,region,projection,files}=options,emit=options.emit??(()=>{});
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
 const verify=()=>{for(const file of files)if(!readFileSync(join(root,file.place)).equals(Buffer.from(file.text)))throw Error('REFUSE·input changed '+file.place);};
 verify();
 const projected=ask(base,[{...(projectedPlace?{place:projectedPlace}:{}),protocol:PROTOCOL,verb:'render',rootScope:'',region:projection,at:1,reads:['**'],lines:inputLines(files),files:[]}],projectionContext)[0];
 if(projected?.kind!=='fact'||!Array.isArray(projected.lines))throw Error('REFUSE·input projection '+(projected?.why??'no lines'));
 const plans=new Map<string,Plan>();
 for(const line of projected.lines){const f=fields(line),scope=f.scope??'',resolution=/^receipt:(\d+)$/.exec(f.at??'');
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
 const prior=shardLines(store,speaker,journal),results=new Map<string,{digest:string;lines:readonly string[]}>(),out:string[]=[];
 const carried=(digest:string)=>join(store,'cas','carried',digest.split(':')[1]??'');
 const saved=(text:string)=>{const digest=hash(text),path=carried(digest);mkdirSync(dirname(path),{recursive:true});if(!existsSync(path)||hash(readFileSync(path,'utf8'))!==digest)replaceWhole(path,text);return digest;};
 const load=(digest:string)=>{if(!digest.startsWith(algorithm+':')||! /^[a-f0-9]+$/.test(digest.split(':')[1]??''))return;const path=carried(digest);if(!existsSync(path))return;const text=readFileSync(path,'utf8');return hash(text)===digest?text:undefined;};
 let read=0,opened=0,executed=0;
 for(const plan of ordered){actCosts.measure(()=>{
  // Retained evidence does not authorize a current answer.
  options.assertCurrent?.();
  const legacyClosure=[plan.line,canonical({scope:'implementation',role:'writes',form:'alphabet',measure:'digest',value:identity,by:'host',at:'policy:input-identity'}),...plan.inputs.map(input=>canonical({scope:input,role:'writes',form:'alphabet',measure:'digest',value:hash(handed.get(input)!),by:'host',at:'policy:input-identity'})),...plan.needs.map(need=>canonical({scope:need,role:'writes',form:'alphabet',measure:'digest',value:results.get(need)!.digest,by:'host',at:'policy:input-identity'}))].sort(byBytes).join('\n')+'\n';
  const leafContext=commit(options.context,region,readingPlace);
  const context=leafContext&&{...leafContext,policy:hash(JSON.stringify([leafContext!.policy,options.allowsEmpty===true,options.lifetime??null,options.readerReference??null,capsule.selection??null,capsule.lines])),inputs:[...[...leafContext!.inputs,...access].map(([name,digest])=>[JSON.stringify(['context',name]),digest] as const),[JSON.stringify(['plan']),hash(plan.line)] as const,...plan.inputs.map(input=>[JSON.stringify(['file',input]),hash(handed.get(input)!)] as const),...plan.needs.map(need=>[JSON.stringify(['receipt',need]),results.get(need)!.digest] as const)]};
  const closure=context?new TextDecoder().decode(readingIdentityBytes(context)):legacyClosure;
  const input=hash(closure),scope='receipts/readings/'+hash(plan.scope).split(':')[1]+'/'+input.split(':')[1],matching=prior.filter(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'measure')==='bytes'&&fieldOf(line,'value')===input).at(-1);
  const count=matching&&prior.filter(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'measure')==='count'&&fieldOf(line,'by')===by).at(-1);
  const heldOutput=count&&load(fieldOf(count,'at').replace(/^place:/,''));
  const heldLines=heldOutput?.split('\n').filter(Boolean);
  const output=heldLines!==undefined&&fieldOf(count!,'value')===`${heldLines.length}..${heldLines.length}`&&heldLines.every(line=>{const f=fields(line);return f.by===by&&f.at==='place:'+input;})?heldOutput:undefined;
  let lines:readonly string[],payload:string;
  if(output!==undefined&&load(input)===closure){if(output===''&&!options.allowsEmpty)throw Error('REFUSE·reading empty response is not admitted '+plan.scope);lines=output.split('\n').filter(Boolean);for(const line of lines)fields(line);payload=fieldOf(count!,'at').replace(/^place:/,'');}
  else {
   if(readOnly())throw Error('REFUSE·preview reading closure is unpaid '+plan.scope);
   const started=process.hrtime.bigint();
   const dependencies=plan.needs.flatMap(need=>results.get(need)!.lines),answer=ask(input,[{...(readingPlace?{place:readingPlace}:{}),protocol:PROTOCOL,verb:'read',rootScope:plan.scope,name:plan.scope,region,at:plan.resolution,reads:['**'],lines:[...inputLines(plan.inputs.map(place=>({place,text:handed.get(place)!}))),...dependencies],files:[]}],context)[0];
   if(answer?.kind!=='fact'||!Array.isArray(answer.claims))throw Error('REFUSE·reading '+plan.scope+' · '+(answer?.why??'no claims'));
   lines=answer.claims.map((unknown:any)=>{if(typeof unknown?.scope!=='string'||typeof unknown?.measure!=='string'||typeof unknown?.role!=='string'||!unknown.bound||!['interval','enumerated'].includes(unknown.bound.kind))throw Error('REFUSE·reading malformed claim '+plan.scope);const span=unknown.bound;const text=canonical({scope:unknown.scope,measure:unknown.measure,role:unknown.role,form:span.kind==='interval'?'interval':'alphabet',value:span.kind==='interval'?`${span.lo}..${span.hi}`:Array.isArray(span.values)?span.values.join('|'):'',by,at:'place:'+input});fields(text);return text;});
   if(!lines.length&&!options.allowsEmpty)throw Error('REFUSE·reading empty response is not admitted '+plan.scope);
   executed++;verify();options.assertCurrent?.();payload=saved(lines.length?[...lines].sort(byBytes).join('\n')+'\n':'');if(saved(closure)!==input)throw Error('REFUSE·receipt input closure mismatch');
   const seconds=(Number(process.hrtime.bigint()-started)/1e9).toFixed(6);
   landShard(store,speaker,journal,[canonical({scope,role:'writes',form:'interval',measure:'count',value:`${lines.length}..${lines.length}`,by,at:'place:'+payload}),canonical({scope,role:'writes',form:'alphabet',measure:'bytes',value:input,by,at:'place:'+input}),canonical({scope,role:'writes',form:'interval',measure:'s',value:seconds+'..'+seconds,by,at:'place:'+input})]);
   if(plan.resolution===1)opened++;
  }
  const receipt=context?readingReceiptIdentity(input,payload,bytes=>hash(new TextDecoder().decode(bytes))):payload;
  if(context&&plan.resolution!==1)out.push(canonical({scope:receiptScope(scope),role:'writes',form:'alphabet',measure:'digest',value:receipt,by,at:'place:'+input}));
  results.set(plan.scope,{digest:receipt,lines});out.push(canonical({scope:plan.scope,role:'writes',form:'alphabet',measure:'observed',value:input,by,at:'place:'+input}),
   // A logical reading name is not a physical input coordinate. Preserve the
   // host-verified handoff beside the result so portable file seals retain
   // every input, including explicitly read foreign files.
   // Input witnesses do not locate the result at each input. Result attribution
   // remains the logical reading's place; two inputs are not two new origins.
   ...plan.inputs.map(coordinate=>canonical({scope:coordinate,role:'writes',form:'alphabet',measure:'observed',value:hash(handed.get(coordinate)!),by,at:'witness:'+input})),...lines);
  if(plan.resolution===1){read++;const output=load(payload);if(output===undefined)throw Error('REFUSE·receipt missing verified carrier '+payload);const costs=shardLines(store,speaker,journal).filter(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'measure')==='s'&&fieldOf(line,'at')==='place:'+input);out.push(...portableReadingReceipt(scope,by,closure,output,hash,!!context,costs));}
 });}
 verify();emit(`RECEIPTS ${read} read · ${opened} opened · reading closures`);
 return{lines:out,read,opened,executed};
}

/** Verify the native reading carriers before a file seal may reuse them. These are semantic receipts, not file-region seals. */
export function verifiedReadingReceipts(store:string,lines:readonly string[],digest:(text:string)=>string,environment?:readonly ReadingReference[]|((context:ReadingIdentityContext)=>readonly ReadingReference[]|undefined),requireContext=false):number|undefined {
 const units=lines.filter(line=>fieldOf(line,'scope').startsWith('receipts/readings/')&&fieldOf(line,'measure')==='bytes'&&fieldOf(line,'role')==='writes');
 const load=(id:string,row:string)=>{const hex=id.split(':')[1];if(!hex||!/^[a-f0-9]+$/.test(hex))return;
  const supplied=fields(row).about;
  // A supplied carrier must authenticate even if an old local copy still exists.
  if(supplied!==undefined)return digest(supplied)===id?supplied:undefined;
  const path=join(store,'cas','carried',hex);if(!existsSync(path))return;const bytes=readFileSync(path,'utf8');return digest(bytes)===id?bytes:undefined;};
 for(const unit of units){
  const input=fieldOf(unit,'value'),scope=fieldOf(unit,'scope'),by=fieldOf(unit,'by'),counts=lines.filter(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'measure')==='count'&&fieldOf(line,'by')===by&&fieldOf(line,'role')==='writes');
  if(counts.length!==1||load(input,unit)===undefined)return;
  const count=counts[0]!,output=load(fieldOf(count,'at').replace(/^place:/,''),count);if(output===undefined)return;
  const inputBytes=load(input,unit)!;
  if(inputBytes.trimStart().startsWith('[')){
   let context:unknown;try{context=JSON.parse(inputBytes);}catch{return;}
   if(!Array.isArray(context)||context.length!==6||context[0]!=='reading-context@1')return;
   const canonicalContext={instrument:context[1],implementation:context[2],policy:context[3],inputs:context[4],environment:context[5]};
   try{if(new TextDecoder().decode(readingIdentityBytes(canonicalContext))!==inputBytes)return;}catch{return;}
   if(environment){const expected=typeof environment==='function'?environment(canonicalContext as ReadingIdentityContext):environment;
    if(expected===undefined||JSON.stringify([...expected].sort((a,b)=>byBytes(a[0],b[0])))!==JSON.stringify(context[5]))return;}
   const identity=lines.filter(line=>fieldOf(line,'scope')===receiptScope(scope)&&fieldOf(line,'measure')==='digest'&&fieldOf(line,'by')===by&&fieldOf(line,'role')==='writes'&&fieldOf(line,'at')==='place:'+input);
   const expected=readingReceiptIdentity(input,fieldOf(count,'at').replace(/^place:/,''),bytes=>digest(new TextDecoder().decode(bytes)));
   if(identity.length!==1||fieldOf(identity[0]!,'value')!==expected)return;
  }else if(requireContext||!inputBytes.endsWith('\n')||inputBytes.split('\n').filter(Boolean).some(line=>parse(line).kind!=='fact'))return;
  const rows=output.split('\n').filter(Boolean);
  if(fieldOf(count,'value')!==`${rows.length}..${rows.length}`||rows.some(line=>fieldOf(line,'by')!==by||fieldOf(line,'at')!=='place:'+input))return;
 }
 return units.length;
}
