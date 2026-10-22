import {posix} from 'node:path';
import {sha256,isSha256} from '../hash.ts';
import {archiveCoordinate} from '../archive.ts';
import {compareStrings as compare} from '../order.ts';
import {moduleClosures,type ModuleClosureSnapshot,type ModuleClosureLimits} from './module-closure.ts';
export {moduleSnapshot,type ModuleClosureSnapshot} from './module-closure.ts';
export {moduleInventory,type ModuleInventory,type ModuleInventorySource,type ModuleInventoryLine,type ModuleInventoryContext} from './module-inventory.ts';

export interface ClosureDeliveryLimits extends Omit<ModuleClosureLimits,'portableESM'> {readonly responseBytes:number}
export interface ClosureNotice {readonly snapshot:string;readonly coordinate:string;readonly digest:string;readonly source:string}
export interface ClosureDeliveryManifest {
 readonly format:'esm-file-closure/1';
 readonly needs:readonly {name:string;snapshot:string;entry:string}[];
 readonly modules:readonly {snapshot:string;coordinate:string;digest:string;path:string}[];
 readonly libraries:readonly {parent:string;specifier:string;snapshot:string;entry:string}[];
 readonly notices:readonly {snapshot:string;coordinate:string;digest:string;path:string}[];
}
export interface ClosureDelivery {
 readonly closure:string;
 readonly digest:string;
 readonly bytes:Uint8Array;
 readonly manifest:ClosureDeliveryManifest;
 readonly files:readonly {path:string;source:string}[];
 readonly importMap:{imports:Record<string,string>;scopes:Record<string,Record<string,string>>};
}
type Library=(specifier:string,parent:ModuleClosureSnapshot)=>ModuleClosureSnapshot|undefined;
const fail=(why:string):never=>{throw Error('REFUSE·closure delivery '+why)};
const key=(identity:string,coordinate:string)=>JSON.stringify([identity,coordinate]);
const pathOf=(identity:string,coordinate:string)=>{
 if(!isSha256(identity))return fail('snapshot identity is not SHA-256');
 return 'modules/'+identity.slice(7)+'/'+coordinate;
};
const urlOf=(path:string)=>'./'+path.split('/').map(encodeURIComponent).join('/');
const resourceLimits=(limits:ClosureDeliveryLimits):void=>{
 if(!limits||!Number.isSafeInteger(limits.members)||limits.members<1||!Number.isSafeInteger(limits.bytes)||limits.bytes<1||!Number.isSafeInteger(limits.responseBytes)||limits.responseBytes<1)fail('missing resources');
 if(limits.signal?.aborted)fail('cancelled');
};

/** The host selects already authenticated snapshots and resolution, never the
 * offered program. This prepares unchanged ESM files, not a JS sandbox, signer,
 * browser host or symbol-pruning bundler. Native loading boundaries remain separately declared.
 */
export function deliverModuleClosure(needs:readonly string[],entries:ReadonlyMap<string,ModuleClosureSnapshot>,library:Library,limits:ClosureDeliveryLimits,notices:readonly ClosureNotice[]=[]):ClosureDelivery {
 resourceLimits(limits);
 if(!Array.isArray(notices)||notices.length>=limits.members)fail('notice resources');
 let noticeBytes=0;
 const noticePaths=new Set<string>();
 const retainedNotices=notices.map(n=>{
  if(!n||typeof n.coordinate!=='string'||archiveCoordinate(n.coordinate)!==n.coordinate||typeof n.source!=='string'||!isSha256(n.digest)||sha256(n.source)!==n.digest||(noticeBytes+=Buffer.byteLength(n.source))>=limits.bytes)fail('notice bytes/resources');
  const path='notices/'+pathOf(n.snapshot,n.coordinate).slice('modules/'.length);
  if(noticePaths.has(path))fail('duplicate notice');noticePaths.add(path);
  return {snapshot:n.snapshot,coordinate:n.coordinate,digest:n.digest,path};
 }).sort((a,b)=>compare(a.path,b.path));
 if(!Array.isArray(needs)||!needs.length||needs.length>limits.members||needs.some(n=>typeof n!=='string'||!n||Buffer.byteLength(n)>limits.bytes))fail('missing/oversized needs');
 const requested=[...new Set(needs)].sort(compare),snapshots=new Map<string,ModuleClosureSnapshot>(),bindings=new Map<string,{parent:string;specifier:string;snapshot:string;entry:string}>();
 const hold=(one:ModuleClosureSnapshot):ModuleClosureSnapshot=>{
  if(!one||!isSha256(one.identity))return fail('snapshot identity is not SHA-256');
  const old=snapshots.get(one.identity);
  // Different entry points may share one immutable snapshot, not different members.
  if(old&&old.members!==one.members)fail('ambiguous snapshot members');
  snapshots.set(one.identity,one);return one;
 };
 const roots=requested.map(name=>{const one=entries.get(name);if(!one)return fail('unknown need '+name);return hold(one)});
 const reached=moduleClosures(roots,(specifier,parent)=>{
  const found=library(specifier,parent);if(!found)return;
  const one=hold(found),at=key(parent.identity,specifier),binding={parent:parent.identity,specifier,snapshot:one.identity,entry:one.entry},old=bindings.get(at);
  if(old&&(old.snapshot!==one.identity||old.entry!==one.entry))fail('ambiguous library resolution');
  if(!old&&bindings.size>=limits.members)fail('library resources');
  bindings.set(at,binding);return one;
 },{...limits,members:limits.members-notices.length,bytes:limits.bytes-noticeBytes,portableESM:true});
 if(notices.some(n=>!reached.some(r=>r.snapshot===n.snapshot)))fail('notice outside reached snapshots');
 const modules=[...reached].sort((a,b)=>compare(key(a.snapshot,a.coordinate),key(b.snapshot,b.coordinate))).map(r=>({...r,path:pathOf(r.snapshot,r.coordinate)}));
 const files=modules.map(r=>{
  const source=snapshots.get(r.snapshot)?.members.get(r.coordinate)?.source;
  if(source===undefined||sha256(source)!==r.digest)fail('snapshot changed during delivery');
  return {path:r.path,source:source!};
 });
 for(const n of retainedNotices)files.push({path:n.path,source:notices.find(one=>one.snapshot===n.snapshot&&one.coordinate===n.coordinate)!.source});
 const manifest:ClosureDeliveryManifest={format:'esm-file-closure/1',needs:requested.map((name,i)=>({name,snapshot:roots[i]!.identity,entry:posix.normalize(roots[i]!.entry)})),modules,libraries:[...bindings.values()].sort((a,b)=>compare(key(a.parent,a.specifier),key(b.parent,b.specifier))),notices:retainedNotices};
 const closure=sha256(JSON.stringify(manifest));
 const bytes=Buffer.from(JSON.stringify({manifest,files}),'utf8');
 if(bytes.length>limits.responseBytes)fail('response resources');
 if(limits.signal?.aborted)fail('cancelled');
 const imports=Object.fromEntries(manifest.needs.map(n=>[n.name,urlOf(pathOf(n.snapshot,n.entry))]));
 const scopes:Record<string,Record<string,string>>={};
 for(const b of manifest.libraries){const scope='./modules/'+b.parent.slice(7)+'/';const values=scopes[scope]??(scopes[scope]=Object.create(null) as Record<string,string>);values[b.specifier]=urlOf(pathOf(b.snapshot,posix.normalize(b.entry)))}
 return {closure,digest:sha256(bytes),bytes:new Uint8Array(bytes),manifest,files,importMap:{imports,scopes}};
}

/** Verify exact pinned delivery bytes and run the same pre-execution closure
 * verifier again over the delivered set. No callbacks, install paths or verifier
 * chosen by the payload. The returned import map is derived, never trusted input.
 */
export function verifyModuleDelivery(bytes:Uint8Array,expected:string,limits:ClosureDeliveryLimits):ClosureDelivery {
 resourceLimits(limits);
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>limits.responseBytes||!isSha256(expected)||sha256(bytes)!==expected)fail('bundle bytes differ or exceed resources');
 let value:{manifest:ClosureDeliveryManifest;files:ClosureDelivery['files']};
 try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return fail('invalid JSON bytes')}
 const manifest=value?.manifest;
 if(manifest?.format!=='esm-file-closure/1'||!Array.isArray(manifest.needs)||!Array.isArray(manifest.modules)||!Array.isArray(manifest.libraries)||!Array.isArray(manifest.notices)||!Array.isArray(value.files)||manifest.modules.length+manifest.notices.length>limits.members||value.files.length!==manifest.modules.length+manifest.notices.length||manifest.needs.length>limits.members||manifest.libraries.length>limits.members)fail('invalid manifest resources');
 const snapshots=new Map<string,Map<string,{source:string;digest:string}>>(),files=new Map<string,string>();
 let size=0;
 for(const file of value.files){if(typeof file?.path!=='string'||typeof file.source!=='string'||files.has(file.path)||(size+=Buffer.byteLength(file.source))>limits.bytes)fail('invalid/duplicate file resources');files.set(file.path,file.source)}
 for(const m of manifest.modules){
  if(!m||typeof m.coordinate!=='string'||typeof m.path!=='string'||m.path!==pathOf(m.snapshot,m.coordinate)||!isSha256(m.digest))fail('invalid module');
  const source=files.get(m.path);if(source===undefined||sha256(source)!==m.digest)fail('module bytes differ');
  const members=snapshots.get(m.snapshot)??new Map();if(members.has(m.coordinate))fail('duplicate module');members.set(m.coordinate,{source,digest:m.digest});snapshots.set(m.snapshot,members);
 }
 const snapshot=(identity:string,entry:string):ModuleClosureSnapshot=>{const members=snapshots.get(identity);if(!members||typeof entry!=='string')return fail('unknown snapshot/entry');return {identity,entry,members}};
 const entries=new Map<string,ModuleClosureSnapshot>();
 for(const n of manifest.needs){if(typeof n?.name!=='string'||entries.has(n.name))fail('invalid/duplicate need');entries.set(n.name,snapshot(n.snapshot,n.entry))}
 const bindings=new Map<string,ModuleClosureSnapshot>();
 for(const b of manifest.libraries){if(typeof b?.parent!=='string'||typeof b.specifier!=='string'||bindings.has(key(b.parent,b.specifier)))fail('invalid/duplicate library');bindings.set(key(b.parent,b.specifier),snapshot(b.snapshot,b.entry))}
 const notices=manifest.notices.map(n=>{if(!n||typeof n.path!=='string'||!files.has(n.path))return fail('missing notice');return {snapshot:n.snapshot,coordinate:n.coordinate,digest:n.digest,source:files.get(n.path)!}});
 const prepared=deliverModuleClosure([...entries.keys()],entries,(specifier,parent)=>bindings.get(key(parent.identity,specifier)),limits,notices);
 if(prepared.digest!==expected)fail('noncanonical, extra or unresolved delivery members');
 return prepared;
}
