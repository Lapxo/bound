import {actCosts} from './act-cost.ts';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {canonical,parse,PROTOCOL,byBytes} from '@lapxo/topos/wire';
import type {Capsule} from './capsule.ts';
import {replaceWhole,landShard,shardLines} from '../land/ledger.ts';
import {fieldOf} from '../fold/claims.ts';
import {readOnly} from './read-only.ts';

type File={readonly place:string;readonly text:string;readonly bytes?:Uint8Array};
const fileBytes=(file:File):Buffer=>Buffer.from(file.bytes??Buffer.from(file.text));
const byteEncoded=(file:File):boolean=>!fileBytes(file).equals(Buffer.from(file.text));
const semanticInput=(file:File):string=>byteEncoded(file)?'base64:'+fileBytes(file).toString('base64'):file.text;
type Plan={scope:string;inputs:readonly string[];needs:readonly string[];resolution:number;line:string};
const fields=(line:string)=>{const got=parse(line);if(got.kind!=='fact')throw Error('REFUSE·input projection contains a non-wire line');return got.value.fields;};
export const inputLines=(files:readonly File[]):readonly string[]=>files.map(file=>canonical({scope:file.place,form:'alphabet',measure:byteEncoded(file)?'bytes':'text',role:'writes',value:byteEncoded(file)?'base64':'lock',shape:file.place,about:byteEncoded(file)?fileBytes(file).toString('base64'):file.text,by:'host',at:'policy:handed-input'}));
/** The selected world owns input projection and reading. The host only verifies closures and keeps native count/bytes receipts. */
export function readingClosures(options:{root:string;store:string;reader:string;speaker:string;digest:(text:string)=>string;capsule:Capsule;region:string;projection:string;allowsEmpty?:boolean;files:readonly File[];emit?:(line:string)=>void}):{lines:readonly string[];read:number;opened:number;executed:number}{
 const {root,store,reader,speaker,digest:hash,capsule,region,projection,files}=options,emit=options.emit??(()=>{});
 const algorithm=hash('').split(':')[0]!,handed=new Map(files.map(file=>[file.place,file]));
 if(handed.size!==files.length)throw Error('REFUSE·input projection has duplicate handed coordinates');
 const verify=()=>{for(const file of files)if(!readFileSync(join(root,file.place)).equals(fileBytes(file)))throw Error('REFUSE·input changed '+file.place);};
 verify();
 const projected=capsule.ask([{protocol:PROTOCOL,verb:'render',rootScope:'',region:projection,at:1,reads:['**'],lines:inputLines(files),files:[]}])[0];
 if(projected?.kind!=='fact'||!Array.isArray(projected.lines))throw Error('REFUSE·input projection '+(projected?.why??'no lines'));
 const plans=new Map<string,Plan>();
 for(const line of projected.lines){const f=fields(line),scope=f.scope??'',resolution=/^receipt:(\d+)$/.exec(f.at??'');
  if(!scope||plans.has(scope)||f.form!=='alphabet'||f.measure!=='reads'||f.role!=='reads'||!resolution)throw Error('REFUSE·input projection ambiguous reading '+scope);
  const inputs=(f.value??'').split('|').filter(Boolean),needs=(f.needs??'').split('|').filter(Boolean);
  if(!inputs.length||new Set(inputs).size!==inputs.length||inputs.some(input=>!handed.has(input))||new Set(needs).size!==needs.length)throw Error('REFUSE·input projection has unhanded or duplicate dependencies '+scope);
  const n=Number(resolution[1]);if(!Number.isSafeInteger(n))throw Error('REFUSE·input projection invalid resolution '+scope);
  plans.set(scope,{scope,inputs,needs,resolution:n,line:canonical({scope,form:f.form,measure:f.measure,role:f.role,value:inputs.join('|'),needs:needs.join('|'),at:f.at})});
 }
 if(!plans.size)throw Error('REFUSE·input projection returned no readings');
 const ordered:Plan[]=[],visiting=new Set<string>(),done=new Set<string>();
 const visit=(scope:string)=>{if(done.has(scope))return;if(visiting.has(scope))throw Error('REFUSE·input projection dependency cycle '+scope);const p=plans.get(scope);if(!p)throw Error('REFUSE·input projection missing reading '+scope);visiting.add(scope);for(const need of p.needs)visit(need);visiting.delete(scope);done.add(scope);ordered.push(p);};
 for(const scope of plans.keys())visit(scope);
 const identity=hash([capsule.selection??'',capsule.digest,region,projection].join('\n')),by=speaker+':'+identity.split(':')[1]!.slice(0,12),journal='reading-closures/'+identity.split(':')[1];
 const prior=shardLines(store,speaker,journal),results=new Map<string,{digest:string;lines:readonly string[]}>(),out:string[]=[];
 const carried=(digest:string)=>join(store,'cas','carried',digest.split(':')[1]??'');
 const saved=(text:string)=>{const digest=hash(text),path=carried(digest);mkdirSync(dirname(path),{recursive:true});if(!existsSync(path)||hash(readFileSync(path,'utf8'))!==digest)replaceWhole(path,text);return digest;};
 const load=(digest:string)=>{if(!digest.startsWith(algorithm+':')||! /^[a-f0-9]+$/.test(digest.split(':')[1]??''))return;const path=carried(digest);if(!existsSync(path))return;const text=readFileSync(path,'utf8');return hash(text)===digest?text:undefined;};
 let read=0,opened=0,executed=0;
 for(const plan of ordered){actCosts.measure(()=>{
  const closure=[plan.line,canonical({scope:'implementation',role:'writes',form:'alphabet',measure:'digest',value:identity,by:'host',at:'policy:input-identity'}),...plan.inputs.map(input=>canonical({scope:input,role:'writes',form:'alphabet',measure:'digest',value:hash(semanticInput(handed.get(input)!)),...(byteEncoded(handed.get(input)!)?{about:'input:base64'}:{}),by:'host',at:'policy:input-identity'})),...plan.needs.map(need=>canonical({scope:need,role:'writes',form:'alphabet',measure:'digest',value:results.get(need)!.digest,by:'host',at:'policy:input-identity'}))].sort(byBytes).join('\n')+'\n';
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
   const dependencies=plan.needs.flatMap(need=>results.get(need)!.lines),answer=capsule.ask([{protocol:PROTOCOL,verb:'read',rootScope:plan.scope,name:plan.scope,region,at:plan.resolution,reads:['**'],lines:[...inputLines(plan.inputs.map(place=>handed.get(place)!)),...dependencies],files:[]}])[0];
   if(answer?.kind!=='fact'||!Array.isArray(answer.claims))throw Error('REFUSE·reading '+plan.scope+' · '+(answer?.why??'no claims'));
   lines=answer.claims.map((unknown:any)=>{if(typeof unknown?.scope!=='string'||typeof unknown?.measure!=='string'||typeof unknown?.role!=='string'||!unknown.bound||!['interval','enumerated'].includes(unknown.bound.kind))throw Error('REFUSE·reading malformed claim '+plan.scope);const span=unknown.bound;const text=canonical({scope:unknown.scope,measure:unknown.measure,role:unknown.role,form:span.kind==='interval'?'interval':'alphabet',value:span.kind==='interval'?`${span.lo}..${span.hi}`:Array.isArray(span.values)?span.values.join('|'):'',by,at:'place:'+input});fields(text);return text;});
   if(!lines.length&&!options.allowsEmpty)throw Error('REFUSE·reading empty response is not admitted '+plan.scope);
   executed++;verify();payload=saved(lines.length?[...lines].sort(byBytes).join('\n')+'\n':'');if(saved(closure)!==input)throw Error('REFUSE·receipt input closure mismatch');
   const seconds=(Number(process.hrtime.bigint()-started)/1e9).toFixed(6);
   landShard(store,speaker,journal,[canonical({scope,role:'writes',form:'interval',measure:'count',value:`${lines.length}..${lines.length}`,by,at:'place:'+payload}),canonical({scope,role:'writes',form:'alphabet',measure:'bytes',value:input,by,at:'place:'+input}),canonical({scope,role:'writes',form:'interval',measure:'s',value:seconds+'..'+seconds,by,at:'place:'+input})]);
   if(plan.resolution===1)opened++;
  }
  results.set(plan.scope,{digest:payload,lines});out.push(canonical({scope:plan.scope,role:'writes',form:'alphabet',measure:'observed',value:input,by,at:'place:'+input}),...lines);
  if(plan.resolution===1){read++;const native=shardLines(store,speaker,journal).filter(line=>fieldOf(line,'scope')===scope&&((fieldOf(line,'measure')==='bytes'&&fieldOf(line,'value')===input)||(fieldOf(line,'measure')==='count')||(fieldOf(line,'measure')==='s'&&fieldOf(line,'at')==='place:'+input))).map(line=>{
   const f=fields(line),id=f.measure==='bytes'?f.value:f.measure==='count'?(f.at??'').replace(/^place:/,''):undefined;
   if(id===undefined)return line;
   const bytes=load(id);if(bytes===undefined)throw Error('REFUSE·receipt missing verified carrier '+id);
   // The full-resolution native row carries the actual verified UTF-8 bytes.
   // Its semantic count/digest is unchanged; a public copy needs no private CAS.
   return canonical({...f,about:bytes});
  });out.push(canonical({scope,role:'writes',form:'alphabet',measure:'observed',value:payload,by,at:'place:'+payload}),...native);}
 });}
 verify();emit(`RECEIPTS ${read} read · ${opened} opened · reading closures`);
 return{lines:out,read,opened,executed};
}

/** Verify the native reading carriers before a file seal may reuse them. These are semantic receipts, not file-region seals. */
export function verifiedReadingReceipts(store:string,lines:readonly string[],digest:(text:string)=>string):number|undefined {
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
  const rows=output.split('\n').filter(Boolean);
  if(fieldOf(count,'value')!==`${rows.length}..${rows.length}`||rows.some(line=>fieldOf(line,'by')!==by||fieldOf(line,'at')!=='place:'+input))return;
 }
 return units.length;
}
