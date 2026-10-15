import {sha256 as digest} from '../hash.ts';
import {isAbsolute} from 'node:path';
import {realpathSync} from 'node:fs';
import {release} from 'node:os';
import {readBoundedBatch} from './bounded-file.ts';
import type {Declaration} from './loader.ts';
export interface LogicalMember {readonly coordinate:string;readonly digest:string;readonly bytes:number}
export interface LogicalLoader {readonly members:readonly LogicalMember[];readonly libraries:readonly {name:string;manifest:string}[];readonly builtins:readonly string[];readonly entries:readonly string[];readonly platform:string}
export interface ImageMount {readonly coordinate:string;readonly path:string}
export interface ImageBudget {readonly members:number;readonly bytes:number}
const fail=(why:string):never=>{throw Error('REFUSE·native image '+why)};
const coordinate=(name:string)=>typeof name==='string'&&name!==''&&!isAbsolute(name)&&!name.includes('\0')&&!name.includes('\\')&&!name.split('/').some(step=>!step||step==='.'||step==='..');
/** Identifies the admitted Node/OS ABI condition, not a seal of backing libraries
 * or portability proof. The signed image must explicitly name this condition.
 */
export const nodePlatformIdentity=()=>digest(JSON.stringify(['node-abi/1',process.platform,process.arch,process.versions,release()]));
/** Mount only signed logical references at exact bytes. Physical locations are
 * an execution envelope and never a source of implementation identity.
 */
export function mountNativeImage(loader:LogicalLoader,mounts:readonly ImageMount[],entry:string,budget:ImageBudget):{identity:string;declaration:Declaration;entries:readonly string[]}{
 if(!budget||!Number.isSafeInteger(budget.members)||budget.members<1||!Number.isSafeInteger(budget.bytes)||budget.bytes<1)fail('missing input resources');
 if(!loader||!Array.isArray(loader.members)||!Array.isArray(loader.libraries)||!Array.isArray(loader.builtins)||!Array.isArray(loader.entries)||loader.members.length>budget.members||mounts.length!==loader.members.length||loader.libraries.length>budget.members||loader.builtins.length>budget.members||loader.entries.length>budget.members)fail('input member resources');
 if(loader.platform!==nodePlatformIdentity())fail('declared Node platform differs');
 const named=new Map<string,LogicalMember>();let total=0;
 for(const member of loader.members){if(!member||!coordinate(member.coordinate)||named.has(member.coordinate)||!/^sha256:[0-9a-f]{64}$/.test(member.digest)||!Number.isSafeInteger(member.bytes)||member.bytes<0||(total+=member.bytes)>budget.bytes)fail('missing/duplicate/oversized member');named.set(member.coordinate,member)}
 const paths=new Map<string,string>();for(const mount of mounts){if(!coordinate(mount.coordinate)||!named.has(mount.coordinate)||paths.has(mount.coordinate)||!isAbsolute(mount.path))fail('unhanded or ambiguous mount');paths.set(mount.coordinate,realpathSync(mount.path))}
 if(!coordinate(entry)||!loader.entries.includes(entry)||new Set(loader.entries).size!==loader.entries.length||loader.entries.some(e=>!named.has(e)))fail('entry outside signed image');
 const data=readBoundedBatch(loader.members.map(m=>({path:paths.get(m.coordinate)!,coordinate:m.coordinate})),budget.bytes);
 loader.members.forEach((member,index)=>{if(data[index]!.length!==member.bytes||digest(data[index]!)!==member.digest)fail('actual bytes differ '+member.coordinate)});
 const declarations=new Set<string>();const libraries=loader.libraries.map(lib=>{if(!lib||typeof lib.name!=='string'||declarations.has(lib.name)||!named.has(lib.manifest))return fail('unknown or duplicate library');declarations.add(lib.name);return{name:lib.name,manifest:paths.get(lib.manifest)!,coordinate:lib.manifest}});
 const identity=digest(JSON.stringify(['logical-native-image/1',loader]));
 return {identity,declaration:{members:loader.members.map(m=>({path:paths.get(m.coordinate)!,digest:m.digest,bytes:m.bytes})),libraries,builtins:[...loader.builtins],entry:paths.get(entry)!,platform:loader.platform},entries:loader.entries.map(e=>paths.get(e)!)};
}
