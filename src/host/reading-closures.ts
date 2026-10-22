import {actCosts} from './act-cost.ts';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {canonical,parse,PROTOCOL,byBytes} from '@lapxo/topos/wire';
import {landShard,shardLines} from '../land/ledger.ts';
import {fieldOf} from '../fold/claims.ts';
import {readOnly} from './read-only.ts';
import {readingIdentityBytes,readingReceiptIdentity} from '@lapxo/topos/contract';
import type {ReadingIdentityContext} from '@lapxo/topos/contract';
import type {ReadingReference} from './reading-context.ts';

export type {CurrentReading} from './reading-preparation.ts';
import {readingPreparation,inputLines,readingFields as fields} from './reading-preparation.ts';
import type {ReadingClosureOptions} from './reading-preparation.ts';
export {inputLines} from './reading-preparation.ts';
const receiptScope=(scope:string):string=>[scope,'identity'].join('/');
/** One portable native receipt carrier shared by file plans and native capsule batches. */
export function portableReadingReceipt(scope:string,by:string,closure:string,output:string,hash:(text:string)=>string,modern=true,costs:readonly string[]=[]):readonly string[]{
 const input=hash(closure),payload=hash(output),rows=output.split('\n').filter(Boolean);
 return [...(modern?[canonical({scope:receiptScope(scope),role:'writes',form:'alphabet',measure:'digest',value:readingReceiptIdentity(input,payload,bytes=>hash(new TextDecoder().decode(bytes))),by,at:'place:'+input})]:[]),canonical({scope,role:'writes',form:'alphabet',measure:'observed',value:payload,by,at:'place:'+payload}),canonical({scope,role:'writes',form:'alphabet',measure:'bytes',value:input,by,at:'place:'+input,about:closure}),canonical({scope,role:'writes',form:'interval',measure:'count',value:`${rows.length}..${rows.length}`,by,at:'place:'+payload,about:output}),...costs];
}

/** The selected world owns input projection and reading. The host only verifies closures and keeps native count/bytes receipts. */
export function readingClosures(options:ReadingClosureOptions):{lines:readonly string[];read:number;opened:number;executed:number}{
 const {root,store,reader,speaker,digest:hash,capsule,region,projection,files}=options,emit=options.emit??(()=>{});
 const {ordered,identity,by,journal,prior,prepare,retained,verify,ask,load,saved,handed,readingPlace}=readingPreparation(options);
 const results=new Map<string,{digest:string;lines:readonly string[]}>(),out:string[]=[];
 let read=0,opened=0,executed=0;
 for(const plan of ordered){actCosts.measure(()=>{
  // Retained evidence does not authorize a current answer.
  options.assertCurrent?.();
  const {context,closure,input,scope}=prepare(plan,results),held=retained({context,closure,input,scope});
  let lines:readonly string[],payload:string;
  if(held){lines=held.lines;payload=held.payload;}
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
// Successful *pure* unit validation is shared across calls by complete content
// references. Both input and output carriers are freshly loaded and hashed
// before lookup; duplicate rows and environment callbacks are never bypassed.
const verifiedUnits=new Set<string>();
const VERIFIED_UNIT_LIMIT=1024;
export function verifiedReadingReceipts(store:string,lines:readonly string[],digest:(text:string)=>string,environment?:readonly ReadingReference[]|((context:ReadingIdentityContext)=>readonly ReadingReference[]|undefined),requireContext=false):number|undefined {
 // Index this invocation's exact rows once. Keep duplicate occurrences: they must still refuse.
 const units:string[]=[],countsBy=new Map<string,string[]>(),identitiesBy=new Map<string,string[]>();
 const key=(scope:string,by:string,at?:string)=>JSON.stringify(at===undefined?[scope,by]:[scope,by,at]);
 const add=(index:Map<string,string[]>,name:string,line:string)=>{const rows=index.get(name);if(rows)rows.push(line);else index.set(name,[line]);};
 for(const line of lines){const scope=fieldOf(line,'scope');if(!scope.startsWith('receipts/readings/')||fieldOf(line,'role')!=='writes')continue;const measure=fieldOf(line,'measure'),by=fieldOf(line,'by');if(measure==='bytes')units.push(line);else if(measure==='count')add(countsBy,key(scope,by),line);else if(measure==='digest')add(identitiesBy,key(scope,by,fieldOf(line,'at')),line);}

 const load=(id:string,row:string)=>{const hex=id.split(':')[1];if(!hex||!/^[a-f0-9]+$/.test(hex))return;
  const supplied=fields(row).about;
  // A supplied carrier must authenticate even if an old local copy still exists.
  if(supplied!==undefined)return digest(supplied)===id?supplied:undefined;
  const path=join(store,'cas','carried',hex);if(!existsSync(path))return;const bytes=readFileSync(path,'utf8');return digest(bytes)===id?bytes:undefined;};
 for(const unit of units){
  const input=fieldOf(unit,'value'),scope=fieldOf(unit,'scope'),by=fieldOf(unit,'by'),counts=countsBy.get(key(scope,by))??[],inputBytes=load(input,unit);
  if(counts.length!==1||inputBytes===undefined)return;
  const count=counts[0]!,output=load(fieldOf(count,'at').replace(/^place:/,''),count);if(output===undefined)return;
  const identityRows=identitiesBy.get(key(receiptScope(scope),by,'place:'+input))??[];
  const unitKey=environment?undefined:digest(JSON.stringify([input,fieldOf(count,'at'),scope,by,fieldOf(count,'value'),identityRows,requireContext]));
  if(unitKey&&verifiedUnits.has(unitKey))continue;
  if(inputBytes.trimStart().startsWith('[')){
   let context:unknown;try{context=JSON.parse(inputBytes);}catch{return;}
   if(!Array.isArray(context)||context.length!==6||context[0]!=='reading-context@1')return;
   const canonicalContext={instrument:context[1],implementation:context[2],policy:context[3],inputs:context[4],environment:context[5]};
   try{if(new TextDecoder().decode(readingIdentityBytes(canonicalContext))!==inputBytes)return;}catch{return;}
   if(environment){const expected=typeof environment==='function'?environment(canonicalContext as ReadingIdentityContext):environment;
    if(expected===undefined||JSON.stringify([...expected].sort((a,b)=>byBytes(a[0],b[0])))!==JSON.stringify(context[5]))return;}
   const identity=identitiesBy.get(key(receiptScope(scope),by,'place:'+input))??[];
   const expected=readingReceiptIdentity(input,fieldOf(count,'at').replace(/^place:/,''),bytes=>digest(new TextDecoder().decode(bytes)));
   if(identity.length!==1||fieldOf(identity[0]!,'value')!==expected)return;
  }else if(requireContext||!inputBytes.endsWith('\n')||inputBytes.split('\n').filter(Boolean).some(line=>parse(line).kind!=='fact'))return;
  const rows=output.split('\n').filter(Boolean);
  if(fieldOf(count,'value')!==`${rows.length}..${rows.length}`||rows.some(line=>fieldOf(line,'by')!==by||fieldOf(line,'at')!=='place:'+input))return;
  if(unitKey){if(verifiedUnits.size>=VERIFIED_UNIT_LIMIT)verifiedUnits.delete(verifiedUnits.values().next().value!);verifiedUnits.add(unitKey);}
 }
 return units.length;
}
