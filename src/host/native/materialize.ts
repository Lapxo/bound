/** Fixed host materialization from admitted logical references. Physical locations
 * never arrive from a reader packet and never become semantic source identity.
 */
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync,realpathSync,renameSync,chmodSync} from 'node:fs';
import {join,dirname,relative,sep,extname} from 'node:path';
import {tmpdir} from 'node:os';
import{fileURLToPath}from'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {members as archiveMembers,archiveCoordinate} from '../archive.ts';
import {blobAt,storeAt,holdStore} from '../../land/ledger.ts';
import {ContentNeeded} from '../content-needed.ts';
import {processOf,ownRoot} from '../../observe/runner.ts';
import {instrumentCoordinates} from '../../fold/digests.ts';
import {readBoundedFile} from './bounded-file.ts';
import {assertNativeRouteCurrent,nativeRouteStore,nativeMountIdentity,type NativeRoute} from './route.ts';
import type {ReadingReference} from '../reading-context.ts';
const fail=(why:string):never=>{throw Error('REFUSE·native materialize '+why)};
const sha=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export interface NativeMaterialization {readonly archive:string;readonly cwd:string;readonly mountIdentity:string;readonly locations:readonly {member:string;path:string;kind:'module'|'data'|'binary'}[]}
const mounted=new Map<string,NativeMaterialization>();
function laid(store:string,digest:string,remaining:number):{path:string;bytes:Buffer}{const path=blobAt(store,digest);if(!existsSync(path))throw new ContentNeeded(digest);const bytes=readBoundedFile(path,remaining,digest);if(sha(bytes)!==digest)fail('laid bytes differ '+digest);return{path,bytes}}
/** Called under the actual Root lease before identity/cache preparation. Missing
 * laid content is a named content demand, never a publisher authority fallback.
 * One retained mount per immutable selection avoids copying it on each ask.
 */
export function materializeNativeRoute(route:NativeRoute):NativeMaterialization{
 assertNativeRouteCurrent(route);const store=nativeRouteStore(route),mountIdentity=nativeMountIdentity(route.profile,route.binaries,route.control),key=store+'\0'+mountIdentity,old=mounted.get(key);if(old){const members=new Map<string,typeof route.profile.selection.members[number]>();for(const member of route.profile.selection.members){if(members.has(member.coordinate))fail('ambiguous image coordinate');members.set(member.coordinate,member);}let bytes=0;for(const location of old.locations){const member=members.get(location.member)??fail('retained image member not selected '+location.member);const raw=readBoundedFile(location.path,route.profile.selection.budget.bytes-bytes,location.member);bytes+=raw.length;if(sha(raw)!==member.digest)fail('retained image member differs '+member.coordinate);if(location.kind==='binary'&&location.member!==route.profile.selection.runtime&&!route.binaries.some(b=>b.profile.entry.path===location.member&&b.origin))chmodSync(location.path,0o555);}return old;}
 const selection=route.profile.selection,budget=selection.budget;
 if(!Number.isSafeInteger(budget.bytes)||budget.bytes<1||!Number.isSafeInteger(budget.members)||budget.members<1||selection.members.length>budget.members)fail('missing image resources');
 const archive=laid(store,selection.archive,budget.bytes);gunzipSync(archive.bytes,{maxOutputLength:budget.bytes});const files=new Map(archiveMembers(archive.bytes).map(member=>[member.name,member.bytes]));
 let charged=archive.bytes.length,retainedBytes=0;const root=storeAt(store,'cas','laid',mountIdentity.slice(7)),present=existsSync(root);mkdirSync(dirname(root),{recursive:true});const building=present?root:mkdtempSync(root+'.part-'),seen=new Set<string>();
 try{const locations=selection.members.map(member=>{const coordinate=archiveCoordinate(member.coordinate);if(coordinate!==member.coordinate||seen.has(coordinate))return fail('ambiguous image coordinate');seen.add(coordinate);
  const binary=route.binaries.filter(b=>b.profile.entry.path===coordinate),origins=binary.flatMap(b=>b.origin?[b.origin]:[]);if(new Set(origins.map(o=>o.path)).size>1)fail('conflicting binary origins');const origin=origins[0];if(origin&&binary.some(b=>!b.origin))fail('conflicting relocation/origin meaning');
  let bytes:Uint8Array,path:string;
  if(coordinate===selection.runtime){path=realpathSync(process.execPath);bytes=readBoundedFile(path,budget.bytes-charged,coordinate);}
  else if(origin){path=origin.path;bytes=readBoundedFile(path,budget.bytes-charged,coordinate);}
  else{const packed=files.get(coordinate);if(packed!==undefined)bytes=packed;else bytes=laid(store,member.digest,budget.bytes-charged).bytes;path=join(building,coordinate);}
  if(binary.some(b=>b.profile.entry.bytes!==bytes.length))fail('binary entry byte count differs '+coordinate);
  if(bytes.length>budget.bytes-charged||(charged+=bytes.length)>budget.bytes)fail('aggregate image and archive bytes exceeded');if(sha(bytes)!==member.digest)fail('image member differs '+coordinate);
  if(coordinate!==selection.runtime&&!origin){retainedBytes+=bytes.length;if(present){const actual=readBoundedFile(path,bytes.length,coordinate);if(sha(actual)!==member.digest)fail('retained image member differs '+coordinate);}else{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes,{flag:'wx',mode:binary.length?0o555:0o444});}if(binary.length)chmodSync(path,0o555);}
  return{member:coordinate,path,kind:coordinate===selection.runtime||binary.length?'binary' as const:/\.(?:[mc]?js|ts)$/.test(coordinate)?'module' as const:'data' as const};
 });if(!present){renameSync(building,root);for(const location of locations)if(location.member!==selection.runtime&&!route.binaries.some(b=>b.profile.entry.path===location.member&&b.origin))location.path=join(root,location.member);holdStore(store,'laid',mountIdentity,retainedBytes);}const result={archive:archive.path,locations,cwd:root,mountIdentity};mounted.set(key,result);return result;}catch(error){if(!present)rmSync(building,{recursive:true,force:true});throw error}
}
/** Fixed child, lifetime supervisor and transitive host modules enter identity
 * before the cache key. Existing instrument closure resolves actual dependencies;
 * this descriptor never executes a module and never accepts a world verifier.
 */
export function nativeExecutorInputs(route:NativeRoute):readonly ReadingReference[]{
 const store=nativeRouteStore(route),all=new Map<string,string>();for(const entry of [...(route.control?[fileURLToPath(new URL('./control-bridge-worker'+extname(new URL(import.meta.url).pathname),import.meta.url))]:[]),processOf('native'),processOf('lifetime','host'),processOf('custodian'),processOf('native-descendant'),processOf('preload','host/native')])for(const[path,digest]of instrumentCoordinates(store,entry,[],ownRoot(),[],true))all.set(path,digest);
 const refs:ReadingReference[]=[];let bytes=0;
 for(const[path,digest]of all){const held=readBoundedFile(path,route.profile.selection.budget.bytes-bytes,path);bytes+=held.length;if(sha(held)!==digest)fail('fixed executor changed during descriptor');const local=relative(ownRoot(),path);let name:string;
  if(!local.startsWith('..'+sep)&&local!=='..')name=local.split(sep).join('/');
  else{let cursor=dirname(path);for(;;){const manifest=join(cursor,'package.json');if(existsSync(manifest)){let pkg:any;try{const raw=readBoundedFile(manifest,route.profile.selection.budget.bytes-bytes,manifest);bytes+=raw.length;pkg=JSON.parse(raw.toString('utf8'));if(typeof pkg.name==='string')refs.push(['native/executor/library/'+pkg.name+'/package.json',sha(raw)])}catch{return fail('fixed dependency manifest invalid')}if(typeof pkg.name!=='string')return fail('fixed dependency has no declared name');name='library/'+pkg.name+'/'+relative(cursor,path).split(sep).join('/');break;}const parent=dirname(cursor);if(parent===cursor)return fail('fixed dependency logical coordinates absent');cursor=parent;}}
  refs.push(['native/executor/'+name,digest]);
 }
 return [...new Map(refs).entries()];
}
