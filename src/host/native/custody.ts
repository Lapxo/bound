/** Fixed Root constructor for finite descendant custody. It selects only current
 * authenticated Root records matching the already planned native parent job.
 */
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {topos_wire_parse as parse} from "../../../vendor/library.js";
import {processOf,ownRoot} from '../../observe/runner.ts';
import{selectedHostControl}from'./control-selection.ts';
import {readBoundedFile} from './bounded-file.ts';
import {authenticateSignedPort,type RootStanding,type PortProfile} from './reading.ts';
import {createProducerJobCustody} from './generated-custodian.ts';
import type {RootJobCustody,NodeImage} from './node-jobs.ts';
import type {Handoff} from './jobs.ts';
import type {LogicalLoader} from './image.ts';
const fail=(why:string):never=>{throw Error('REFUSE·native custody '+why)};
const sha=(raw:Uint8Array)=>'sha256:'+createHash('sha256').update(raw).digest('hex');
export function nativeRootJobCustody(root:RootStanding,profile:PortProfile,handoff:Handoff,image:NodeImage,logical:LogicalLoader):RootJobCustody{
 const data=logical.members.map(member=>{const location=image.locations.find(loc=>loc.member===member.coordinate);if(!location)return fail('literal member absent');return{path:location.path,digest:member.digest}}),libraries=logical.libraries.map(lib=>{const location=image.locations.find(loc=>loc.member===lib.manifest);if(!location)return fail('library absent');return{name:lib.name,manifest:location.path,coordinate:lib.manifest}});
 const candidates=root.live.flatMap(line=>{const row=parse(line);if(row.kind!=='fact'||!row.value.fields.scope.startsWith('port/'))return[];let p:any;try{p=JSON.parse(row.value.fields.about??'')}catch{return[];}return p?.selector?.port===profile.port.coordinate?[{coordinate:row.value.fields.scope,profile:p}]:[]});
 return{async open(parent){
  const matching=candidates.filter(candidate=>candidate.profile.selector.binding===parent.binding&&candidate.profile.selector.implementation===parent.implementation);
  const producers=matching.filter(candidate=>candidate.profile.profile==='host-generated-executable@3');if(producers.length!==1)return fail('requires one current Root producer for '+parent.binding);
  const selected=producers[0]!;authenticateSignedPort(root,selected.coordinate);const control=selectedHostControl(root,profile);
  const implementation=fileURLToPath(new URL('./generated'+extname(new URL(import.meta.url).pathname),import.meta.url)),implementationBytes=readBoundedFile(implementation,root.budget.bytes,implementation);
  const runtime=image.locations.find(location=>location.member===image.runtime),runtimeMember=handoff.members.find(member=>member.coordinate===image.runtime);if(!runtime||!runtimeMember)return fail('fixed actual runtime absent');
  const binaries=matching.filter(candidate=>['host-native-binary@1','host-native-binary-origin@1'].includes(candidate.profile.profile)).map(candidate=>{const p=candidate.profile,location=image.locations.find(loc=>loc.member===p.entry?.path),member=handoff.members.find(m=>m.coordinate===p.entry?.path);if(!location||!member)return fail('binary outside actual selected image');return{coordinate:candidate.coordinate,privateBinding:{coordinate:member.coordinate,path:location.path,digest:member.digest}}});
  const programs=matching.filter(candidate=>candidate.profile.profile==='host-native-program@1').map(candidate=>({coordinate:candidate.coordinate,runtimeBinding:{coordinate:image.runtime,path:runtime.path,digest:runtimeMember.digest,members:image.locations.map(location=>({coordinate:location.member,path:location.path}))}}));
  const directory=mkdtempSync(join(tmpdir(),'bound-native-custody-')),contextFile=join(directory,'context.json'),configFile=join(directory,'loader.json');
  let acquired:Awaited<ReturnType<RootJobCustody['open']>>|undefined;
  try{const service=createProducerJobCustody({root,coordinate:selected.coordinate,implementationBytes,snapshot:{budget:{members:handoff.budget.members,bytes:handoff.budget.bytes},members:data,libraries,builtins:logical.builtins,platform:logical.platform},nativeImplementations:new Set(logical.members.map(member=>member.digest)),directory,contextFile,nativeBinaries:binaries,programSelections:programs});acquired=await service.open(parent);
   const client=processOf('custodian'),clientBytes=readBoundedFile(client,parent.responseBytes,client),preload=new URL(pathToFileURL(processOf('native-descendant')).href);preload.searchParams.set('config',configFile);preload.searchParams.set('bytes',String(handoff.budget.bytes));
   let controlEnvelope:any;if(control){const worker=control.profile.worker,path=join(ownRoot(),worker.coordinate.slice('native/executor/'.length)),raw=readBoundedFile(path,worker.bytes,worker.coordinate);if(raw.length!==worker.bytes||sha(raw)!==worker.digest)return fail('sealed control worker bytes differ');if(control.profile.runtime.coordinate!==image.runtime||control.profile.runtime.digest!==runtimeMember.digest)return fail('sealed control runtime differs');const shared=32+2*parent.responseBytes;if(!Number.isSafeInteger(shared)||shared>control.profile.limits.sharedBytes)return fail('shared control resource absent');controlEnvelope={profileLine:control.line,realm:control.profile.realm,worker:{...worker,path},resources:{inputBytes:parent.responseBytes,outputBytes:parent.responseBytes,sharedBytes:control.profile.limits.sharedBytes}};}
   const config={...(controlEnvelope?{control:controlEnvelope}:{}),members:data,libraries,builtins:logical.builtins,platform:logical.platform,executableDigests:logical.members.filter(member=>/\.(?:[mc]?js|ts)$/.test(member.coordinate)).map(member=>member.digest),metadataDigests:logical.members.filter(member=>member.coordinate.endsWith('.json')).map(member=>member.digest),inputBytes:handoff.budget.bytes,runtimeBytes:runtimeMember.bytes.byteLength,clientBytes:clientBytes.length,contextBytes:parent.responseBytes,custodian:{contextFile,client,runtime:runtime.path,preload:preload.href,runtimeDigest:runtimeMember.digest,clientDigest:sha(clientBytes)}};
   // Loader metadata describes the authenticated input image, not the command's
   // stdout. Its declared input budget stays separate from responseBytes.
   const raw=Buffer.from(JSON.stringify(config));if(raw.length>handoff.budget.bytes)return fail('operational descendant envelope bytes');writeFileSync(configFile,raw,{flag:'wx',mode:0o400});
   // The URL carries an independently fixed expected digest of the private host
   // envelope. This is operational custody, never authority from JSON.
   preload.searchParams.set('digest',sha(raw));config.custodian.preload=preload.href;
   // The recursive preload URL excludes its own digest while writing the file;
   // its fixed child validates the exact file before installing any hook.
   const descendant={...config,custodian:{...config.custodian,preload:preload.href}};
   const held=acquired;return{descendant,assertClosed:()=>held!.assertClosed(),async close(){try{await held!.close()}finally{rmSync(directory,{recursive:true,force:true})}}};
  }catch(error){await acquired?.close();rmSync(directory,{recursive:true,force:true});throw error}
 }};
}
