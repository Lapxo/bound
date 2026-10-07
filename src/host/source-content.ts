import {transportBytes} from './ports/transport.ts';
import {contentStore,verifiedContent} from './content-store.ts';
import {ContentNeeded} from './content-needed.ts';
import {createHash} from 'node:crypto';
import {parse,wireAt} from '@lapxo/topos/wire';
import {landBlob} from '../land/ledger.ts';
import {ownLock} from '../observe/runner.ts';
export interface ContentPort {
 readonly algorithms: ReadonlySet<string>;
 readonly read: (digest:string)=>Uint8Array|undefined;
 readonly write: (digest:string,bytes:Uint8Array)=>void;
 readonly fetch: (url:string,digest?:string)=>Promise<Uint8Array>;
}
/** Transport uses declared locations; only the requested digest admits bytes into the cache. */
export async function resolveSelectedContent(lines:readonly string[],port:ContentPort,requested:readonly string[]):Promise<readonly string[]> {
 const fields=lines.flatMap(line=>{const p=parse(line);return p.kind==='fact'&&p.value.fields.value!=='withdraw'?[p.value.fields]:[];});
 const selectionIndex=(scope:string):number=>{const match=/(^|\/)uses\//.exec(scope);return match===null?-1:match.index+match[1].length;};
 // A dependency constraint is not a content binding. Historical artifact records
 // use measure=id; explicit digest records still validate even when malformed.
 const bindings=fields.filter(f=>selectionIndex(f.scope??'')>=0 ||
  (f.scope?.startsWith('dep/')&&(f.measure==='digest'||/^[a-zA-Z][a-zA-Z0-9-]*:[a-f0-9]+$/.test(f.value??''))));
 const locations=new Map<string,string[]>();
 for(const binding of bindings){
  const scope=binding.scope??'';const index=selectionIndex(scope);
  const sourceScope=index>=0?scope.slice(0,index)+'sources/'+scope.slice(index+5):'sources/'+scope.slice(4);
  const urls=fields.filter(f=>f.scope===sourceScope).map(f=>f.value??'');
  if(urls.length)locations.set(binding.value??'', [...new Set([...(locations.get(binding.value??'')??[]),...urls])]);
 }
 const received:string[]=[];
 const validate=(digest:string):{algorithm:string;hex:string}=>{
  const split=digest.indexOf(':');const algorithm=digest.slice(0,split),hex=digest.slice(split+1);
  if(split<1||!port.algorithms.has(algorithm)||! /^[a-f0-9]+$/.test(hex))throw Error(`REFUSE·pin ${digest} digest is not admitted`);
  return {algorithm,hex};
 };
 const ensure=async(digest:string):Promise<Uint8Array>=>{
  const {algorithm,hex}=validate(digest);
  const verify=(bytes:Uint8Array):Uint8Array=>{
   if(createHash(algorithm).update(bytes).digest('hex')!==hex)throw Error(`REFUSE·pin ${digest} content hash mismatch · not laid`);
   return bytes;
  };
  const cached=port.read(digest);if(cached!==undefined)return verify(cached);
  const urls=locations.get(digest)??[];
  if(!urls.length)throw Error(`REFUSE·pin ${digest} content unavailable · no declared source · not laid`);
  let last:unknown;
  for(const url of urls){
   let bytes:Uint8Array;
   try{bytes=await port.fetch(url,digest);}catch(error){last=error;continue;}
   verify(bytes);port.write(digest,bytes);received.push(digest);return bytes;
  }
  throw Error(`REFUSE·source ${digest} ${last instanceof Error?last.message:'declared sources unavailable'}`);
 };
 for(const digest of new Set(requested))await ensure(digest);
 return received;
}
/** Exact resource URLs; no repository checkout or inferred release. */
export async function resolveSources(standing:readonly string[],requested:readonly string[]):Promise<void> {
 const instrument=ownLock().flatMap(line=>{const p=parse(line);return p.kind==='fact'?[p.value.fields]:[];});
 const wire=wireAt(instrument,Number.MAX_SAFE_INTEGER);
 if(wire===null)throw Error('REFUSE·pin instrument has no admitted wire');
 const bindings=ownLock().filter(line=>{
  const p=parse(line);if(p.kind!=='fact')return false;
  const fields=p.value.fields;
  return fields.scope?.startsWith('sources/') || fields.scope?.startsWith('dep/');
 });
 const received=await resolveSelectedContent([...standing,...bindings],{
  algorithms:wire.digests,
  read:digest=>{try{return verifiedContent(digest).bytes;}catch(error){if(error instanceof ContentNeeded)return undefined;throw error;}},
  write:(digest,bytes)=>{landBlob(contentStore(),digest,bytes);},
  fetch:async (url,digest)=>transportBytes(url,digest!,[...ownLock(),...standing]),
 },requested);
 for(const digest of received)process.stdout.write(`FETCHED  ${digest} · verified\n`);
}


/** A changed verified store is the only reason to retry. A repeated miss never loops or changes a named pin. */
export async function resolveRequested<T>(resolve:(digest:string)=>Promise<void>,fold:()=>Promise<T>):Promise<T> {
 const attempted=new Set<string>();
 for(;;) {
  try{return await fold();}
  catch(error) {
   if(!(error instanceof ContentNeeded)||attempted.has(error.digest))throw error;
   attempted.add(error.digest);
   await resolve(error.digest);
  }
 }
}
