import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {sha256} from '../host/hash.ts';
import type {topos_wire_ObjectRecord as ObjectRecord,topos_wire_ObjectContext as ObjectContext} from "../../vendor/library.js";
import type {ObjectReading} from '../engine/index.ts';
import {toposAt} from '../host/selected-topos.ts';
import {storeOf} from '../land/ledger.ts';
import {evaluateWasm} from './adapter.ts';
import type {WasmRequest,WasmLimits,WorkerPort} from './adapter.ts';
type Fields=Readonly<Record<string,string>>;
interface FormBinding {readonly form:string;readonly export:'intervalForm'|'alphabetOfForm';readonly contextArtifact:string}
interface Manifest {readonly runtime:string;readonly wasm:string;readonly modules:Readonly<Record<string,string>>;readonly byteLengths:{readonly runtime:number;readonly wasm:number;readonly modules:Readonly<Record<string,number>>};readonly forms?:Readonly<Record<string,FormBinding>>}
function refuse(cause:string):never {throw Error('REFUSE·wasm object '+cause);}
/** Configuration is the caller's already authenticated, live standing; selection grants no authority. */
export function usesWasmObject(configuration:readonly Fields[]):boolean {
 const rows=configuration.filter(f=>f.scope==='engine/object'&&f.value!=='withdraw');
 if(!rows.length)return false;
 if(rows.length!==1||rows[0]!.role!=='writes'||rows[0]!.measure!=='id'||rows[0]!.form!=='alphabet'||!['esm@1','wasm@1'].includes(rows[0]!.value??''))refuse('unique declared backend required');
 return rows[0]!.value==='wasm@1';
}
function limit(configuration:readonly Fields[],name:string,measure:string):number {
 const rows=configuration.filter(f=>f.scope==='engine/wasm/'+name&&f.value!=='withdraw');
 if(rows.length!==1||rows[0]!.form!=='interval'||rows[0]!.measure!==measure||rows[0]!.role!=='writes')refuse('missing or ambiguous '+name+' limit');
 const span=/^(0|[1-9][0-9]*)\.\.(0|[1-9][0-9]*)$/.exec(rows[0]!.value??'');
 if(!span||!Number.isSafeInteger(Number(span[1]))||!Number.isSafeInteger(Number(span[2]))||Number(span[1])>Number(span[2])||Number(span[2])<1)refuse('invalid '+name+' limit');
 return Number(span[2]);
}
/** The installed instrument owns the asset/form closure; place input cannot choose executable bytes. */
export async function foldObjectsWithWasm(root:string,records:readonly ObjectRecord[],context:ObjectContext,configuration:readonly Fields[],signal?:AbortSignal):Promise<readonly ObjectReading[]> {
 if(!usesWasmObject(configuration))refuse('backend not selected');
 const limits:WasmLimits={memoryBytes:limit(configuration,'memory','bytes'),stackBytes:limit(configuration,'stack','bytes'),executionMs:limit(configuration,'execution','milliseconds')},lifetimeMs=limit(configuration,'worker-lifetime','milliseconds'),responseBytes=limit(configuration,'response','bytes');
 const assets=new URL('../../assets/wasm/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',assets),'utf8')) as Manifest;
 if(!manifest.forms)refuse('installed form closure missing');
 const codecs:Record<string,{digest:string;export:string;params:unknown}>={};
 for(const record of records.filter(r=>r.record==='cell')){
  const pin=record.fields.topos!,binding=manifest.forms[pin];
  if(!binding||!['intervalForm','alphabetOfForm'].includes(binding.export)||binding.form!==record.fields.form)refuse('unsupported form standing '+pin);
  const standing=toposAt(pin,storeOf(root)),selector=standing.parts.filter(f=>f.scope==='wire/topos/context-view');
  if(selector.length!==1)refuse('context selection '+pin);
  const offers=standing.parts.filter(f=>f.kind==='check'&&f.view===selector[0]!.value);
  if(offers.length!==1||offers[0]!.value!==binding.contextArtifact||!(offers[0]!.restsOn??'').split('|').includes(binding.contextArtifact))refuse('context implementation differs '+pin);
  const selected=context.resolve(record);if(selected.digest!==pin||selected.form.id!==binding.form)refuse('prepared form differs '+record.fields.scope);
  codecs[record.fields.scope!]={digest:pin,export:binding.export,params:selected.params};
 }
 const guestNames=Object.keys(manifest.modules);if(guestNames.length!==1)refuse('installed guest module map');const guestName=guestNames[0]!;
 let program:string;
 try {program=`import{objectFold,intervalForm,alphabetOfForm}from${JSON.stringify(guestName)};const forms={intervalForm,alphabetOfForm},codecs=${JSON.stringify(codecs)},records=${JSON.stringify(records)};const context={resolve:cell=>{const c=codecs[cell.fields.scope];if(!c)throw Error('REFUSE unknown prepared cell');return{digest:c.digest,form:forms[c.export],params:c.params}}};globalThis.result=JSON.stringify(objectFold(records,context));`;}
 catch {return refuse('context is not serializable');}
 const entry=guestName+'.entry',programDigest=sha256(program);
 const guest=readFileSync(new URL('guest.js',assets),'utf8'),modules={[guestName]:guest,[entry]:program},request:WasmRequest={trusted:{...manifest,modules:{...manifest.modules,[entry]:programDigest},entry,aliases:{},limits,byteLengths:{...manifest.byteLengths,modules:{...manifest.byteLengths.modules,[entry]:Buffer.byteLength(program)}}},assets:{runtime:new Uint8Array(readFileSync(new URL('runtime.js',assets))),wasm:new Uint8Array(readFileSync(new URL('runtime.wasm',assets)))},modules,entry,aliases:{},limits};
 const result=await evaluateWasm(request,{workerFactory:()=>new Worker(new URL('./node-worker.js',import.meta.url)) as WorkerPort,lifetimeMs,...(signal?{signal}:{})});
 if(Buffer.byteLength(result.output)>responseBytes)refuse('response bytes limit');
 let readings:unknown;try{readings=JSON.parse(result.output)}catch{return refuse('invalid projection text');}
 if(!Array.isArray(readings)||readings.some(r=>!r||typeof r.cell!=='string'||typeof r.state!=='string'))refuse('invalid projection shape');
 return readings as readonly ObjectReading[];
}
