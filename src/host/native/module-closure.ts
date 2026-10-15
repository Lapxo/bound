import {builtinModules} from 'node:module';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import {moduleImportSyntax} from './module-syntax.ts';
import {members} from '../archive.ts';

export interface ModuleClosureMember { readonly digest: string; readonly source: string }
export interface ModuleClosureSnapshot {
 readonly identity: string;
 readonly entry: string;
 readonly members: ReadonlyMap<string,ModuleClosureMember>;
}
export interface ModuleClosureReading { readonly snapshot: string; readonly coordinate: string; readonly digest: string }

/** Host-selected archive and entry, never a verifier assertion from the program.
 * This proves content identity only; standing admission and runtime capabilities
 * are separate prerequisites. Binary resources are not executable text members.
 */
export function moduleSnapshot(archive:Uint8Array,expected:string,entry:string):ModuleClosureSnapshot{
 const identity='sha256:'+createHash('sha256').update(archive).digest('hex');
 if(!/^sha256:[0-9a-f]{64}$/.test(expected)||identity!==expected)throw Error('REFUSE·module closure archive bytes differ');
 const textMembers=new Map<string,ModuleClosureMember>();
 for(const member of members(archive)){
  // Platform archive metadata remains covered by the archive digest. Its
  // binary header, rather than a filename convention, identifies data.
  if(member.bytes.length>=4&&new DataView(member.bytes.buffer,member.bytes.byteOffset,4).getUint32(0)===0x00051607)continue;
  if(!['.js','.mjs','.cjs','.ts','.json'].includes(posix.extname(member.name)))continue;
  let source:string;
  try{source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(member.bytes);}
  catch{throw Error('REFUSE·module closure invalid UTF-8 bytes '+member.name);}
  textMembers.set(member.name,{source,digest:'sha256:'+createHash('sha256').update(member.bytes).digest('hex')});
 }
 return {identity,entry,members:textMembers};
}

/** The host supplies authenticated snapshot identities and its library resolver.
 * Each reached text member is verified here against its exact UTF-8 bytes.
 * Authentication of the snapshot envelope remains a separate host prerequisite.
 * A capsule cannot select either verifier or resolver.
 * This reads declared module edges, not arbitrary I/O or a JavaScript sandbox. Computed edges are unpaid, never absent.
 * Activation requires an admitted host policy; existing inventory callers are not silently changed.
 */
export function moduleClosure(snapshot: ModuleClosureSnapshot,
 library: (specifier: string, parent: ModuleClosureSnapshot)=>ModuleClosureSnapshot|undefined): readonly ModuleClosureReading[] {
 const seen=new Map<string,ModuleClosureReading>();
 const coordinate=(name:string):string=>{
  const normalized=posix.normalize(name);
  if(!name||name.includes('\0')||name.includes('\\')||posix.isAbsolute(name)||normalized==='..'||normalized.startsWith('../'))throw Error('REFUSE·module closure coordinate leaves snapshot '+name);
  return normalized;
 };
 const walk=(one:ModuleClosureSnapshot,name:string):void=>{
  const at=coordinate(name),key=JSON.stringify([one.identity,at]);
  const member=one.members.get(at);
  if(member===undefined)throw Error('REFUSE·module closure missing '+one.identity+' '+at);
  if(typeof member.source!=='string'||!/^sha256:[0-9a-f]{64}$/.test(member.digest))throw Error('REFUSE·module closure unnamed bytes '+one.identity+' '+at);
  const bytes=Buffer.from(member.source,'utf8');
  if(bytes.toString('utf8')!==member.source)throw Error('REFUSE·module closure invalid UTF-8 text '+one.identity+' '+at);
  if('sha256:'+createHash('sha256').update(bytes).digest('hex')!==member.digest)throw Error('REFUSE·module closure bytes differ '+one.identity+' '+at);
  const kept=seen.get(key);
  if(kept){
   if(kept.digest!==member.digest)throw Error('REFUSE·module closure conflicting member '+one.identity+' '+at);
   return;
  }
  seen.set(key,{snapshot:one.identity,coordinate:at,digest:member.digest});
  // JSON is data under the loader contract, not module syntax.
  if(posix.extname(at)==='.json')return;
  const syntax=moduleImportSyntax(member.source,at);
  if(syntax.unresolved.length)throw Error('REFUSE·module closure unresolved '+at+' '+syntax.unresolved.join(' · '));
  for(const specifier of syntax.imports){
   // createRequire/registerHooks can select executable edges not present in this graph.
   // Their runtime closure needs its own host contract; an arbitrary alias is not a literal edge.
   if(specifier==='node:module'||specifier==='module')throw Error('REFUSE·module closure runtime loader requires declared closure '+specifier+' from '+at);
   if(specifier.startsWith('node:')){
    if(!builtinModules.includes(specifier)&&!builtinModules.includes(specifier.slice(5)))throw Error('REFUSE·module closure unknown builtin '+specifier+' from '+at);
    continue;
   }
   if(builtinModules.includes(specifier))continue;
   if(specifier.startsWith('.')){walk(one,posix.join(posix.dirname(at),specifier));continue;}
   if(specifier.includes(':')||posix.isAbsolute(specifier))throw Error('REFUSE·module closure unsupported location '+specifier+' from '+at);
   const pinned=library(specifier,one);
   if(pinned===undefined)throw Error('REFUSE·module closure unpinned library '+specifier+' from '+at);
   walk(pinned,pinned.entry);
  }
 };
 walk(snapshot,snapshot.entry);
 return [...seen.values()];
}
