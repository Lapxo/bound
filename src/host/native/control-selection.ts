/** Optional Root-selected control transport. This is fixed host machinery,
 * never a world's worker permission or a change to producer message/work caps.
 * One retained control worker belongs only to the main thread of each process;
 * other Node realms keep the existing bounded fixed-client transport. */
import{parsedLine as parse}from'../../fold/claims.ts';
import{authenticateSignedPort,type RootStanding,type PortProfile}from'./reading.ts';
export interface HostControlProfile{readonly profile:'host-control-transport@1';readonly realm:'main-thread';readonly coordinate:string;readonly selector:{readonly port:string;readonly implementation:string};readonly worker:{readonly coordinate:string;readonly digest:string;readonly bytes:number};readonly runtime:{readonly coordinate:string;readonly digest:string};readonly limits:{readonly workersPerProcess:1;readonly inFlight:1;readonly sharedBytes:number}}
export interface HostControlSelection{readonly line:string;readonly profile:HostControlProfile}
const fail=(why:string):never=>{throw Error('REFUSE·host control '+why)};
const keys=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value).sort().join(','):'';
const digest=(value:unknown)=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
export function selectedHostControl(root:RootStanding,parent:PortProfile):HostControlSelection|undefined{
 const coordinate=parent.port.coordinate+'/control',rows=root.live.filter(line=>{const got=parse(line);return got.kind==='fact'&&got.value.fields.scope===coordinate});if(!rows.length)return undefined;
 const selected=authenticateSignedPort(root,coordinate),profile=selected.profile as HostControlProfile,parsed=parse(selected.line);if(parsed.kind!=='fact'||parsed.value.fields.by!==root.signer.id)fail('selection is not Root signed '+coordinate);
 if(keys(profile)!=='coordinate,limits,profile,realm,runtime,selector,worker'||profile.profile!=='host-control-transport@1'||profile.realm!=='main-thread'||profile.coordinate!==coordinate||keys(profile.selector)!=='implementation,port'||profile.selector.port!==parent.port.coordinate||profile.selector.implementation!==parent.port.implementation)fail('profile selector differs '+coordinate);
 if(keys(profile.worker)!=='bytes,coordinate,digest'||!/^native\/executor\/(?:dist|src)\/host\/native\/control-bridge-worker\.(?:js|ts)$/.test(profile.worker.coordinate)||!digest(profile.worker.digest)||!Number.isSafeInteger(profile.worker.bytes)||profile.worker.bytes<1)fail('fixed worker binding absent '+coordinate);
 const runtime=parent.selection.members.find(member=>member.coordinate===parent.selection.runtime);if(keys(profile.runtime)!=='coordinate,digest'||!runtime||profile.runtime.coordinate!==runtime.coordinate||profile.runtime.digest!==runtime.digest)fail('fixed runtime selection differs '+coordinate);
 if(keys(profile.limits)!=='inFlight,sharedBytes,workersPerProcess'||profile.limits.workersPerProcess!==1||profile.limits.inFlight!==1||!Number.isSafeInteger(profile.limits.sharedBytes)||profile.limits.sharedBytes<32)fail('named resource invalid '+coordinate);
 if(!Number.isSafeInteger(parent.port.responseBytes)||parent.port.responseBytes<1||parent.port.responseBytes>2_147_483_647)fail('message cap outside declared signed Int32 representation '+coordinate);
 const required=32+2*parent.port.responseBytes;if(!Number.isSafeInteger(required)||profile.limits.sharedBytes<required)fail('shared resource cannot preserve message caps '+coordinate);
 return Object.freeze({line:selected.line,profile});
}
