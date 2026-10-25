import {BoundRefusal} from './refusals.ts';
import {sha256 as hash,isSha256 as digest} from './hash.ts';
import {lstatSync,opendirSync,readSync,realpathSync,openSync,closeSync,fstatSync,constants} from 'node:fs';
import {join,relative,resolve,sep} from 'node:path';
import {topos_contract_PHYSICAL_LINES_PROFILE as PHYSICAL_LINES_PROFILE,topos_contract_PHYSICAL_LINES_MODEL as PHYSICAL_LINES_MODEL,topos_contract_readPhysicalLines as readPhysicalLines,topos_contract_encodeReadingWitness as encodeReadingWitness,topos_contract_decodeReadingWitness as decodeReadingWitness,topos_contract_readingWitnessStatementBytes as readingWitnessStatementBytes,type topos_contract_ReadingWitness as ReadingWitness} from "../../vendor/library.js";
import {topos_wire_canonical as canonical,topos_wire_byBytes as byBytes,topos_wire_steps as steps} from "../../vendor/library.js";
import {fieldOf,fieldsOf} from '../fold/claims.ts';
import {foldCeilings} from '../fold/ceilings.ts';
import {widenedWithoutWitness} from '../judge/widening.ts';

const actualReadings=new WeakSet<object>();
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child)}return value;}
const fail=(cause:string):never=>{
 const name=cause.split('/')[0]!,kind=['inventory-policy','inventory-boundary','context','run','outside-inventory','inventory-size'].includes(name)?'context':
  ['region-declaration','region-selectors'].includes(name)?'selection':['inventory-moved','per-file-reading','witness-binding'].includes(name)?'integrity':
  (name==='actual-reading-required'||name.startsWith('witness-'))?'witness':'failed';
 throw new BoundRefusal('physical-lines/'+kind,'REFUSE·physical-lines/'+cause);
};
const named=(value:string):boolean=>typeof value==='string'&&value.length>0&&!value.includes('\\')&&!/[\u0000-\u001f\u007f]/.test(value)&&value.split('/').every(part=>part!==''&&part!=='.'&&part!=='..'&&!part.includes('*'));
export interface PhysicalLinesRegion {readonly scope:string;readonly selectors:readonly string[]}
export interface PhysicalLinesPolicy {readonly byteBudget:string;readonly rowBudget:string;readonly entryBudget:number}
export interface PhysicalLinesPlaceInput {
 readonly root:string;
 /** Explicit inventory boundaries, also bound into the reading identity. No implicit exclusions. */
 readonly inventory:readonly string[];
 readonly regions:readonly PhysicalLinesRegion[];
 readonly policy:PhysicalLinesPolicy;
 readonly context:string;
 readonly reader:string;
 readonly implementation:string;
 readonly run:string;
}
/** Projects region selectors from already admitted standing; parsing grants no authority. */
export function physicalLinesRegions(standing:readonly string[]):readonly PhysicalLinesRegion[]{
 const declarations=standing.filter(line=>fieldOf(line,'scope').startsWith('region/')&&fieldOf(line,'measure')==='coordinates'&&fieldOf(line,'value')!=='withdraw');
 return standing.filter(line=>fieldOf(line,'role')==='reads'&&fieldOf(line,'form')==='interval'&&['lines','file-lines'].includes(fieldOf(line,'measure'))).map(line=>{
  const scope=fieldOf(line,'scope'),parts=steps(scope),name=parts.length>1&&parts.at(-1)==='lines'?steps(parts.slice(0,-1)):scope;
  const rows=declarations.filter(row=>fieldOf(row,'scope')==='region/'+name);
  if(rows.length!==1)return fail('region-declaration/'+scope);
  const selectors=fieldOf(rows[0]!,'value').split('|').filter(Boolean);
  if(!selectors.length)return fail('region-selectors/'+scope);
  return {scope,selectors};
 });
}
/** Reads an actual finite inventory. Links and special files are named rather than silently omitted. */
export function readPlacePhysicalLines(input:PhysicalLinesPlaceInput){
 try{return readPhysicalLinesInPlace(input)}catch(error){if(error instanceof BoundRefusal)throw error;throw new BoundRefusal('physical-lines/failed','REFUSE·physical-lines/failed '+(error instanceof Error?error.message:'native inventory unavailable'));}
}
function readPhysicalLinesInPlace(input:PhysicalLinesPlaceInput){
 if(!input||!input.policy||!Number.isSafeInteger(input.policy.entryBudget)||input.policy.entryBudget<0||!/^\d+$/.test(input.policy.byteBudget)||!/^\d+$/.test(input.policy.rowBudget))return fail('inventory-policy');
 if(!Array.isArray(input.inventory)||!input.inventory.length||!input.inventory.every(named)||new Set(input.inventory).size!==input.inventory.length)return fail('inventory-boundary');
 for(const value of [input.context,input.reader,input.implementation])if(!digest(value))return fail('context');
 if(typeof input.run!=='string'||!input.run||/\s/.test(input.run))return fail('run');
 const root=realpathSync(input.root),files:{name:string;digest:string;bytes:Uint8Array}[]=[],seen=new Set<string>();
 let entries=0,bytes=0n;
 const unavailable:{name:string;cause:string}[]=[];
 function visit(name:string):void{
  if(seen.has(name))return;seen.add(name);
  if(++entries>input.policy.entryBudget){unavailable.push({name,cause:'entry-budget'});return;}
  const path=resolve(root,name),local=relative(root,path);
  if(local==='..'||local.startsWith('..'+sep))return fail('outside-inventory');
  let stat;try{stat=lstatSync(path)}catch{unavailable.push({name,cause:'inventory-absent'});return;}
  if(stat.isSymbolicLink()){unavailable.push({name,cause:'inventory-link'});return;}
  if(stat.isDirectory()){
   const directory=opendirSync(path),children:string[]=[];
   try{let child;while((child=directory.readSync())!==null){if(children.length>=input.policy.entryBudget-entries){unavailable.push({name:join(name,child.name).split(sep).join('/'),cause:'entry-budget'});return;}children.push(child.name);}}finally{directory.closeSync()}
   children.sort(byBytes);
   for(const child of children){if(entries>=input.policy.entryBudget){unavailable.push({name:join(name,child).split(sep).join('/'),cause:'entry-budget'});break;}visit(join(name,child).split(sep).join('/'));}
   const after=lstatSync(path);
   if(after.isSymbolicLink()||stat.dev!==after.dev||stat.ino!==after.ino||stat.mtimeMs!==after.mtimeMs)return fail('inventory-moved');
  }else if(stat.isFile()){
   if(!Number.isSafeInteger(stat.size)||stat.size<0)return fail('inventory-size');
   if(bytes+BigInt(stat.size)>BigInt(input.policy.byteBudget)){unavailable.push({name,cause:'byte-budget'});return;}
   if(realpathSync(path)!==path)return fail('inventory-link');
   const descriptor=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
   let body:Buffer,after;try{const buffer=Buffer.alloc(stat.size+1);let offset=0,read=0;while(offset<buffer.length&&(read=readSync(descriptor,buffer,offset,buffer.length-offset,null))>0)offset+=read;body=buffer.subarray(0,offset);after=fstatSync(descriptor)}finally{closeSync(descriptor)}
   if(after.isSymbolicLink()||stat.dev!==after.dev||stat.ino!==after.ino||stat.size!==after.size||stat.mtimeMs!==after.mtimeMs||body.length!==after.size)return fail('inventory-moved');
   bytes+=BigInt(body.length);if(bytes>BigInt(input.policy.byteBudget))return fail('inventory-moved');
   files.push({name,digest:hash(body),bytes:body});
  }else unavailable.push({name,cause:'inventory-special-file'});
 }
 for(const name of [...input.inventory].sort(byBytes))visit(name);
 if(unavailable.length)return {status:'unmeasured' as const,cause:'inventory-incomplete',unavailable};
 files.sort((a,b)=>byBytes(a.name,b.name));
 const snapshot=hash(JSON.stringify(files.map(({name,digest})=>({name,digest}))));
 const reading=readPhysicalLines({profile:PHYSICAL_LINES_PROFILE,snapshot,files,regions:input.regions,policy:{byteBudget:input.policy.byteBudget,rowBudget:input.policy.rowBudget}},hash);
 if(reading.status!=='read')return reading;
 const selection=hash(JSON.stringify(reading.regions.map(({scope,selectors,selections,members})=>({scope,selectors,selections,members}))));
 const params=hash(JSON.stringify({inventory:[...input.inventory].sort(byBytes),policy:input.policy,textDomain:reading.textDomain}));
 const perFile=readPhysicalLines({profile:PHYSICAL_LINES_PROFILE,snapshot,files,regions:files.map(file=>({scope:file.name,selectors:[file.name]})),policy:{byteBudget:input.policy.byteBudget,rowBudget:input.policy.rowBudget}},hash);
 if(perFile.status!=='read')return perFile;
 const result=hash(JSON.stringify({reading,perFile}));
 const bindings={contract:PHYSICAL_LINES_MODEL.contract,model:hash(JSON.stringify(PHYSICAL_LINES_MODEL)),params,inputs:snapshot,selection,unit:'physical-lines/utf8-lf@1',scale:hash('finite-nonnegative-atomic-valuation@1'),resolution:hash('whole-physical-lines@1'),reader:input.reader,implementation:input.implementation,context:input.context,run:input.run,result};
 const identity=hash(JSON.stringify(bindings));
 const selected=new Set(reading.regions.flatMap(region=>region.members));
 const stray=reading.inputFiles.filter(file=>!selected.has(file.name)).map(file=>file.name);
 const actual=freeze({status:'read' as const,identity,bindings:{reading:identity,...bindings},reading,perFile,stray});
 actualReadings.add(actual);return actual;
}
export type PhysicalLinesReading=Extract<ReturnType<typeof readPlacePhysicalLines>,{status:'read'}>;
export type ReadingProducerPolicy=
 | {readonly authentication:'key-covered';readonly key:string;readonly coverage:string}
 | {readonly authentication:'ci-run-unkeyed';readonly repository:string;readonly commit:string;readonly workflow:string;readonly run:string;readonly attempt:string};
export interface PhysicalLinesWitnessAuthority {
 /** Supplied by the host from its admitted, current producer policy, never from the witness. */
 readonly producers:readonly ReadingProducerPolicy[];
 /** Must verify actual signature/coverage or CI evidence bytes over this exact statement. URL presence is insufficient. */
 readonly verify:(input:{readonly witness:ReadingWitness;readonly statementBytes:string;readonly producer:ReadingProducerPolicy})=>boolean;
}
/** Exact result bindings, declared producer authorization, and proof verification are independent checks. */
export function authenticatePhysicalLinesWitness(reading:PhysicalLinesReading,line:string,authority:PhysicalLinesWitnessAuthority):string{
 if(!actualReadings.has(reading))return fail('actual-reading-required');
 let witness:ReadingWitness;try{witness=decodeReadingWitness(line)}catch(error){throw new BoundRefusal('physical-lines/witness','REFUSE·physical-lines/witness '+(error instanceof Error?error.message:'invalid witness record'));}
 for(const [key,value] of Object.entries(reading.bindings))if(witness[key as keyof ReadingWitness]!==value)return fail('witness-binding/'+key);
 const producer=authority.producers.find(policy=>{
  if(policy.authentication!==witness.authentication)return false;
  if(policy.authentication==='key-covered'&&witness.authentication==='key-covered')return policy.key===witness.key&&policy.coverage===witness.coverage;
  if(policy.authentication==='ci-run-unkeyed'&&witness.authentication==='ci-run-unkeyed')return policy.repository===witness.repository&&policy.commit===witness.commit&&policy.workflow===witness.workflow&&policy.run===witness.run&&policy.attempt===witness.attempt;
  return false;
 });
 if(!producer)return fail('witness-producer-not-admitted');
 if(authority.verify({witness,statementBytes:readingWitnessStatementBytes(witness),producer})!==true)return fail('witness-authentication');
 return 'attest:'+hash(encodeReadingWitness(witness));
}
/** This adapter delegates all threshold and widening decisions to the existing Bound judges. */
export function judgePhysicalLines(input:{readonly reading:PhysicalLinesReading;readonly standing:readonly string[];readonly proposed:readonly string[];readonly witness?:string;readonly authority?:PhysicalLinesWitnessAuthority}){
 if(!actualReadings.has(input.reading))return fail('actual-reading-required');
 const isLineCeiling=(line:string)=>fieldOf(line,'form')==='interval'&&fieldOf(line,'role')==='reads'&&['lines','file-lines'].includes(fieldOf(line,'measure'));
 let at:string|undefined;
 if(input.witness!==undefined){if(!input.authority)return fail('witness-authority-absent');at=authenticatePhysicalLinesWitness(input.reading,input.witness,input.authority);}
 // An attest-shaped string alone cannot pass the legacy widening predicate.
 const rejected=input.proposed.filter(line=>{
  const old=input.standing.find(held=>fieldOf(held,'scope')===fieldOf(line,'scope'));
  if(!old||!isLineCeiling(line))return false;
  const bare=canonical({...fieldsOf(line),at:'none'});
  return widenedWithoutWitness([bare],[old],isLineCeiling,'attest').length>0&&(!at||fieldOf(line,'at')!==at);
 });
 const effective=new Map(input.standing.filter(isLineCeiling).map(line=>[fieldOf(line,'scope'),line]));
 for(const line of input.proposed.filter(isLineCeiling))if(!rejected.includes(line))effective.set(fieldOf(line,'scope'),line);
 const thresholds:ReturnType<typeof foldCeilings>[]=[];
 const observations:{scope:string;file?:string;value:string}[]=[];
 const unmeasured:{scope:string;cause:string;selectors:readonly string[]}[]=[];
 for(const line of effective.values()){
  const scope=fieldOf(line,'scope'),region=input.reading.reading.regions.find(region=>region.scope===scope);
  if(!region||region.status!=='measured'||region.selections.some(selection=>selection.status==='unmeasured')){unmeasured.push({scope,cause:'selector-no-match',selectors:region?.selections.filter(selection=>selection.status==='unmeasured').map(selection=>selection.selector)??[]});continue;}
  const measure=fieldOf(line,'measure');
  const values=measure==='file-lines'?region.members.map(name=>{const single=input.reading.perFile.regions.find(one=>one.scope===name);if(!single||single.status!=='measured')return fail('per-file-reading');return single.value;}):[region.value];
  for(const [index,value] of values.entries()){observations.push({scope,...(measure==='file-lines'?{file:region.members[index]}:{}),value:value.numerator});if(value.denominator!=='1'||BigInt(value.numerator)>BigInt(Number.MAX_SAFE_INTEGER))return fail('threshold-number-resolution');thresholds.push(foldCeilings({standing:input.standing,ceilings:[line],observed:[],own:{[measure]:Number(value.numerator)},epoch:0}));}
 }
 return {status:rejected.length||thresholds.some(fold=>fold.over.length)?'BLOCK' as const:!effective.size||unmeasured.length||input.reading.stray.length?'UNMEASURED' as const:'READY' as const,rejected,unmeasured,stray:input.reading.stray,observations,thresholds,reading:input.reading.identity};
}
