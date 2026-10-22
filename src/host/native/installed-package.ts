import {lstatSync,readdirSync,realpathSync} from 'node:fs';
import {join,posix,relative,sep,isAbsolute} from 'node:path';
import {canonical} from '@lapxo/topos/wire';
import {moduleInventory as exportInventory,inventoryBytes} from '@lapxo/topos/contract';
import {archiveCoordinate} from '../archive.ts';
import {sha256,isSha256} from '../hash.ts';
import {compareStrings} from '../order.ts';
import {BoundRefusal,refuseBound as refuse} from '../refusals.ts';
import {readBoundedFile} from './bounded-file.ts';
import {deliverModuleClosure,type ClosureDeliveryLimits} from './module-delivery.ts';
import {moduleInventory,type ModuleInventorySource} from './module-inventory.ts';
import type {ModuleClosureSnapshot} from './module-closure.ts';

export interface InstalledPackageMember {readonly coordinate:string;readonly digest:string}
export interface InstalledPackagePin extends ModuleInventorySource {readonly specifier:string;readonly parent:string;readonly snapshot:string;readonly module:ModuleClosureSnapshot}
export interface InstalledPackageRequest {
 readonly directory:string;
 /** Shape selected by the receiving instrument's admitted pin-shape contract. */
 readonly shape:string;
 /** Complete authenticated file inventory, relative to the selected package root. */
 readonly members:readonly InstalledPackageMember[];
 /** Explicit package export selectors; symbols are never pruning units. */
 readonly exports:readonly (readonly string[])[];
 /** Already authenticated snapshots and resolution selected by the host. */
 readonly pins:readonly InstalledPackagePin[];
 readonly limits:ClosureDeliveryLimits;
}
/** Identity of a complete installed byte snapshot and its selected consumed module
 * closure. Reuses the package export proof, file closure and verified inventory;
 * no compiler, execution, archive reconstruction or package discovery. */
export function installedPackageIdentity(request:InstalledPackageRequest){
 const {limits}=request;
 if(!limits||!Number.isSafeInteger(limits.members)||limits.members<1||!Number.isSafeInteger(limits.bytes)||limits.bytes<1||!Number.isSafeInteger(limits.responseBytes)||limits.responseBytes<1)refuse('installed/resources');
 if(limits.signal?.aborted)refuse('installed/cancelled');
 if(!Array.isArray(request.members)||!request.members.length||request.members.length>limits.members||!Array.isArray(request.exports)||!request.exports.length||request.exports.length>limits.members||!Array.isArray(request.pins)||request.pins.length>limits.members)refuse('installed/resources');
 const expected=new Map<string,string>();
 for(const one of request.members){if(archiveCoordinate(one.coordinate)!==one.coordinate||!isSha256(one.digest)||expected.has(one.coordinate))refuse('installed/inventory');expected.set(one.coordinate,one.digest)}
 let root:string;try{if(!lstatSync(request.directory).isDirectory()||lstatSync(request.directory).isSymbolicLink())refuse('installed/external-member');root=realpathSync(request.directory)}catch(error){if(error instanceof BoundRefusal)throw error;return refuse('installed/missing-member')}
 const files=new Map<string,Uint8Array>();let bytes=0,visited=0;
 function walk(directory:string):void{
  for(const name of readdirSync(directory).sort(compareStrings)){
   if(limits.signal?.aborted)refuse('installed/cancelled');
   if(++visited>limits.members*2)refuse('installed/resources');
   const file=join(directory,name),coordinate=relative(root,file).split(sep).join('/'),stat=lstatSync(file);
   if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))refuse('installed/external-member');
   const physical=relative(root,realpathSync(file));if(isAbsolute(physical)||physical==='..'||physical.startsWith('..'+sep))refuse('installed/external-member');
   if(stat.isDirectory()){walk(file);continue}
   const digest=expected.get(coordinate);if(digest===undefined)refuse('installed/uninventoried-member');
   const data=readBoundedFile(file,limits.bytes-bytes,coordinate);bytes+=data.length;
   if(sha256(data)!==digest)refuse('installed/member-integrity');files.set(coordinate,data);
  }
 }
 walk(root);
 if(files.size!==expected.size)refuse('installed/missing-member');
 const manifest=archiveCoordinate(request.shape+'.json'),manifestBytes=files.get(manifest);if(!manifestBytes)refuse('installed/manifest');
 let pkg:{name?:unknown;version?:unknown;type?:unknown};try{pkg=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes))}catch{return refuse('installed/manifest')}
 if(!pkg||typeof pkg.name!=='string'||!pkg.name||typeof pkg.version!=='string'||!pkg.version||pkg.type!=='module')refuse('installed/manifest');
 const line=(scope:string,value:string,extra:Record<string,string>={})=>canonical({scope,role:'writes',form:'alphabet',measure:'digest',value,by:'target',at:'place:installed-package',...extra});
 const fileLines=[...files].sort(([a],[b])=>compareStrings(a,b)).map(([coordinate,data])=>line('file/'+coordinate,sha256(data)));
 const fileInventory=fileLines.join('\n')+'\n',snapshot=sha256(fileInventory),manifestDigest=sha256(manifestBytes!);
 const text=new Map([...files].filter(([coordinate])=>['.js','.mjs','.cjs','.ts','.json'].includes(posix.extname(coordinate))).map(([coordinate,data])=>{
  let source:string;try{source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data)}catch{return refuse('installed/text-member')}
  return [coordinate,{source,digest:sha256(data)}] as const;
 }));
 const documents=new Map([[manifestDigest,manifestBytes!]]),entries=new Map<string,ModuleClosureSnapshot>();
 const exports=request.exports.map(selector=>{
  let selected:unknown=pkg;
  if(selector[0]!=='exports')refuse('installed/export');
  for(const key of selector){if(!selected||typeof selected!=='object'||Array.isArray(selected)||!Object.prototype.hasOwnProperty.call(selected,key))refuse('installed/export');selected=(selected as Record<string,unknown>)[key]}
  if(typeof selected!=='string'||!selected.startsWith('./'))refuse('installed/export');
  const unit=archiveCoordinate((selected as string).slice(2)),data=files.get(unit);if(!data)refuse('installed/missing-member');
  entries.set(JSON.stringify(selector),{identity:snapshot,entry:unit,members:text});
  return {source:pkg.name as string,version:pkg.version as string,holder:'installed-package',unitKind:'module' as const,unit,reached:true,reachedFrom:{digest:manifestDigest,selector},moduleBytes:data};
 });
 const exportLines=exportInventory(exports,{documents,digestBytes:sha256});
 const pinMap=new Map<string,InstalledPackagePin>();
 for(const pin of request.pins){const key=JSON.stringify([pin.parent==='self'?snapshot:pin.parent,pin.specifier]);if(pinMap.has(key)||!isSha256(pin.snapshot)||pin.module.identity!==pin.snapshot)refuse('installed/pin');pinMap.set(key,pin)}
 const consumed=new Map<string,InstalledPackagePin>();
 const delivery=deliverModuleClosure([...entries.keys()],entries,(specifier,parent)=>{const key=JSON.stringify([parent.identity,specifier]),pin=pinMap.get(key);if(pin)consumed.set(key,pin);return pin?.module},limits,[{snapshot,coordinate:manifest,digest:manifestDigest,source:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(manifestBytes)}]);
 const sources=new Map<string,ModuleInventorySource>([[snapshot,{snapshot,source:pkg.name as string,version:pkg.version as string}]]);
 for(const pin of consumed.values()){const prior=sources.get(pin.snapshot);if(prior&&(prior.source!==pin.source||prior.version!==pin.version))refuse('installed/pin');sources.set(pin.snapshot,{snapshot:pin.snapshot,source:pin.source,version:pin.version})}
 const modules=moduleInventory(delivery.bytes,delivery.digest,limits,[...sources.values()],{scope:'installed/modules',by:'target',at:'place:installed-package'});
 const lines=[line('installed/profile','bound-installed-package@1',{measure:'id'}),line('installed/manifest',manifestDigest,{about:JSON.stringify([request.shape,pkg.name,pkg.version])}),...fileLines,line('installed/exports',sha256(inventoryBytes(exportLines))),line('installed/closure',delivery.closure),line('installed/delivery',delivery.digest),...delivery.manifest.libraries.map(pin=>line('installed/pins/'+encodeURIComponent(JSON.stringify([pin.parent==='self'?snapshot:pin.parent,pin.specifier])),pin.snapshot,{about:pin.entry}))].sort(compareStrings).join('\n')+'\n';
 if(Buffer.byteLength(lines)>limits.responseBytes)refuse('installed/resources');
 return {format:'bound-installed-package/1' as const,digest:sha256(lines),lines,snapshot,manifest:manifestDigest,members:request.members.length,bytes,exportInventory:exportLines,modules,delivery,consumedPins:[...consumed.values()].map(({module,...pin})=>pin)};
}
