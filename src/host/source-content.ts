import {createHash} from 'node:crypto';
import {readStanding} from '@lapxo/topos/standing';
import {parse,wireAt} from '@lapxo/topos/wire';
import {blobAt,landBlob} from '../land/ledger.ts';
import {observeFile} from '../observe/files.ts';
import {ownLock,ownRoot,ownStore} from '../observe/runner.ts';
import {lockStanding} from '../fold/keys.ts';
export interface ContentPort {
 readonly algorithms: ReadonlySet<string>;
 readonly read: (digest:string)=>Uint8Array|undefined;
 readonly write: (digest:string,bytes:Uint8Array)=>void;
 readonly fetch: (url:string)=>Promise<Uint8Array>;
}
/** Transport uses declared locations; only the requested digest admits bytes into the cache. */
export async function resolveSelectedContent(lines:readonly string[],port:ContentPort):Promise<readonly string[]> {
 const fields=lines.flatMap(line=>{const p=parse(line);return p.kind==='fact'&&p.value.fields.value!=='withdraw'?[p.value.fields]:[];});
 const selectionIndex=(scope:string):number=>{const match=/(^|\/)uses\//.exec(scope);return match===null?-1:match.index+match[1].length;};
 const bindings=fields.filter(f=>selectionIndex(f.scope??'')>=0 || f.scope?.startsWith('dep/'));
 const locations=new Map<string,string[]>();
 for(const binding of bindings){
  const scope=binding.scope??'';const index=selectionIndex(scope);
  const sourceScope=index>=0?scope.slice(0,index)+'sources/'+scope.slice(index+5):'sources/'+scope.slice(4);
  const urls=fields.filter(f=>f.scope===sourceScope).map(f=>f.value??'');
  if(urls.length)locations.set(binding.value??'', [...new Set([...(locations.get(binding.value??'')??[]),...urls])]);
 }
 const roots=[...new Set(bindings.filter(f=>selectionIndex(f.scope??'')>=0).map(f=>f.value??''))];
 const received:string[]=[];
 const validate=(digest:string):{algorithm:string;hex:string}=>{
  const split=digest.indexOf(':');const algorithm=digest.slice(0,split),hex=digest.slice(split+1);
  if(split<1||!port.algorithms.has(algorithm)||! /^[a-f0-9]+$/.test(hex))throw Error(`REFUSE·pin ${digest} digest is not admitted`);
  return {algorithm,hex};
 };
 // Refuse malformed declared selections before materializing any dependency.
 for(const binding of bindings)validate(binding.value??'');
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
   const parsed=new URL(url);
   if(!['https:','http:'].includes(parsed.protocol))throw Error(`REFUSE·source ${url} needs an explicit transport adapter`);
   let bytes:Uint8Array;
   try{bytes=await port.fetch(url);}catch(error){last=error;continue;}
   verify(bytes);port.write(digest,bytes);received.push(digest);return bytes;
  }
  throw Error(`REFUSE·source ${digest} ${last instanceof Error?last.message:'declared sources unavailable'}`);
 };
 for(const digest of new Set(bindings.filter(f=>f.scope?.startsWith('dep/')&&f.role==='reads').map(f=>f.value??'')))await ensure(digest);
 for(const digest of roots){
  const topos=readStanding(Buffer.from(await ensure(digest)).toString('utf8'));
  for(const dependency of topos.dependencies)await ensure(dependency);
 }
 return received;
}
/** Exact resource URLs; no repository checkout or inferred release. */
export async function resolveSources(standing:readonly string[]):Promise<void> {
 const instrument=ownLock().flatMap(line=>{const p=parse(line);return p.kind==='fact'?[p.value.fields]:[];});
 const wire=wireAt(instrument,Number.MAX_SAFE_INTEGER);
 if(wire===null)throw Error('REFUSE·pin instrument has no admitted wire');
 const received=await resolveSelectedContent([...standing,...ownLock().filter(line=>{const p=parse(line);return p.kind==='fact'&&(p.value.fields.scope?.startsWith('dep/')||p.value.fields.scope?.startsWith('sources/'));})],{
  algorithms:wire.digests,
  read:digest=>observeFile(blobAt(ownStore(),digest)),
  write:(digest,bytes)=>{landBlob(ownStore(),digest,bytes);},
  fetch:async url=>{
   const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   return new Uint8Array(await response.arrayBuffer());
  },
 });
 for(const digest of received)process.stdout.write(`FETCHED  ${digest} · verified\n`);
}
