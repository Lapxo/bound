/** Isolated host prototype: a program alias is a Root selection, never PATH.
 * This verifies a finite implementation before entry; it executes nothing.
 * The runtime hook must still verify each reached member before loading it. */
import {createHash} from 'node:crypto';
import {isAbsolute, resolve, relative} from 'node:path';
import {realpathSync} from 'node:fs';
import {authenticateSignedPort, nativeParentInputBytes, canonicalJson, type RootStanding} from './reading.ts';
import {readBounded, type ParentExecution} from './generated.ts';
const sha=(b:Uint8Array|string)=>'sha256:'+createHash('sha256').update(b).digest('hex');
const fail=(why:string):never=>{throw Error('REFUSE·native program '+why)};
const keys=(x:object)=>Object.keys(x).sort().join(',');
export interface NativeProgramProfile {
 profile:'host-native-program@1'; coordinate:string; alias:string;
 selector:{port:string;binding:string;implementation:string};
 interpreter:{path:string;digest:string;bytes:number}; root:string; entry:string;
 members:readonly {coordinate:string;digest:string;bytes:number}[];
 limits:{members:number;bytes:number}; condition:string;
}
export interface VerifiedNativeProgram {readonly identity:string}
export interface NativeProgramProjection {alias:string;interpreter:string;interpreterDigest:string;entry:string;root:string;members:readonly {path:string;digest:string}[];condition:string}
const verified=new WeakMap<VerifiedNativeProgram,NativeProgramProjection>();
export function verifyNativeProgram(root:RootStanding,coordinate:string,parent:ParentExecution,runtimeBinding:{coordinate:string;path:string;digest:string;members:readonly {coordinate:string;path:string}[]}):VerifiedNativeProgram {
 const authenticated=authenticateSignedPort(root,coordinate),p=authenticated.profile as NativeProgramProfile;
 if(!p||keys(p)!=='alias,condition,coordinate,entry,interpreter,limits,members,profile,root,selector'||p.profile!=='host-native-program@1'||p.coordinate!==coordinate||typeof p.alias!=='string'||!p.alias.length||p.alias.includes('\0')||typeof p.condition!=='string'||!p.condition.length)fail('selection absent/unknown');
 if(keys(p.selector??{})!=='binding,implementation,port'||canonicalJson(p.selector)!==canonicalJson({port:parent.port,binding:parent.binding,implementation:parent.implementation}))fail('selection differs from parent');
 if(keys(p.limits??{})!=='bytes,members'||!Number.isSafeInteger(p.limits.members)||p.limits.members<1||!Number.isSafeInteger(p.limits.bytes)||p.limits.bytes<1||p.limits.bytes>nativeParentInputBytes(root,parent))fail('implementation resource absent/exceeds Root');
 if([parent.identity,parent.instrument,parent.policy,parent.authority,parent.implementation].some(d=>typeof d!=='string'||!/^sha256:[0-9a-f]{64}$/.test(d)))fail('parent identity absent');
 if(!Array.isArray(p.members)||p.members.length>p.limits.members||typeof p.root!=='string'||isAbsolute(p.root)||p.root.split('/').some(s=>!s||s==='.'||s==='..')||!p.interpreter||typeof p.interpreter.path!=='string'||isAbsolute(p.interpreter.path)||p.interpreter.path!==runtimeBinding.coordinate||keys(p.interpreter)!=='bytes,digest,path'||!Number.isSafeInteger(p.interpreter.bytes)||p.interpreter.bytes<1)fail('interpreter/implementation context absent');
 // This binding comes from the private prepared host image, not the program's
 // declaration. Matching a path alone cannot identify an implementation.
 if(!runtimeBinding||runtimeBinding.path!==parent.runtime||runtimeBinding.digest!==p.interpreter.digest||!parent.inputs.some(p=>p[1]===runtimeBinding.digest))fail('interpreter differs from parent image');
 let bytes=p.interpreter.bytes;if(bytes>p.limits.bytes)fail('interpreter byte resource');const coordinates=new Set<string>();
 for(const m of p.members){if(!m||keys(m)!=='bytes,coordinate,digest'||typeof m.coordinate!=='string'||!m.coordinate.length||isAbsolute(m.coordinate)||m.coordinate.includes('\\')||m.coordinate.split('/').some(x=>!x||x==='.'||x==='..')||coordinates.has(m.coordinate)||!/^sha256:[0-9a-f]{64}$/.test(m.digest)||!Number.isSafeInteger(m.bytes)||m.bytes<0)fail('member identity ambiguous');coordinates.add(m.coordinate);bytes+=m.bytes;if(bytes>p.limits.bytes)fail('implementation byte resource');}
 // All declarations and aggregate resources are checked before reading files.
 if(!coordinates.has(p.entry)||!/^sha256:[0-9a-f]{64}$/.test(p.interpreter.digest))fail('entry/interpreter digest absent');
 const physical=(path:string)=>{try{return realpathSync(path)}catch{return fail('selected member absent '+path)}};
 const entryMount=runtimeBinding.members.find(m=>m.coordinate===p.root+'/'+p.entry);if(!entryMount)return fail('entry mount absent from host image');const levels=p.entry.split('/').length;let physicalRoot=physical(entryMount.path);for(let i=0;i<levels;i++)physicalRoot=resolve(physicalRoot,'..');const interpreter=physical(runtimeBinding.path);
 const interpreterBytes=readBounded(interpreter,p.interpreter.bytes);if(interpreterBytes.length!==p.interpreter.bytes||sha(interpreterBytes)!==p.interpreter.digest)fail('interpreter bytes differ');
 const members=p.members.map(m=>{const mounted=runtimeBinding.members.find(one=>one.coordinate===p.root+'/'+m.coordinate);if(!mounted)return fail('member absent from actual host image '+m.coordinate);const path=physical(mounted.path),r=relative(physicalRoot,path);if(r==='..'||r.startsWith('../')||isAbsolute(r))fail('member outside selected implementation');const b=readBounded(path,m.bytes);if(b.length!==m.bytes||sha(b)!==m.digest)fail('member bytes differ '+m.coordinate);return{path,digest:m.digest}});
 const handle=Object.freeze({identity:sha(canonicalJson([authenticated.line,parent.identity]))});
 verified.set(handle,{alias:p.alias,interpreter,interpreterDigest:p.interpreter.digest,entry:physical(resolve(physicalRoot,p.entry)),root:physicalRoot,members,condition:p.condition});return handle;
}
/** Only the guarded instrument can obtain this from a verified opaque handle.
 * Put it in the signed native image; never accept it from a world proposal. */
export function nativeProgramProjection(handle:VerifiedNativeProgram):NativeProgramProjection {const p=verified.get(handle);if(!p)return fail('unknown verified selection');return JSON.parse(canonicalJson(p));}
